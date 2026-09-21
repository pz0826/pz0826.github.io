#!/usr/bin/env python3
"""Local, persistent photograph curation. Originals are only ever read."""
import argparse
from contextlib import closing
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import os
from pathlib import Path
import sqlite3
import threading
from urllib.parse import parse_qs, urlparse
import uuid

from PIL import Image, ImageCms, ImageOps

WEB = Path(__file__).resolve().parent / 'web'
FORMATS = {'.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp'}


def within(path, root):
    return path == root or root in path.parents


def identity(value):
    return hashlib.sha256(value.encode()).hexdigest()[:24]


class Store:
    def __init__(self, state):
        self.state = Path(state).resolve()
        self.state.mkdir(parents=True, exist_ok=True)
        (self.state / 'cache').mkdir(exist_ok=True)
        self.db = self.state / 'catalog.sqlite3'
        self.lock = threading.RLock()
        self.image_slots = threading.Semaphore(2)
        with closing(self.connect()) as db, db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS libraries (
                  id TEXT PRIMARY KEY, path TEXT UNIQUE, recursive INTEGER, opened TEXT);
                CREATE TABLE IF NOT EXISTS photos (
                  library TEXT, id TEXT, filename TEXT, width INTEGER, height INTEGER,
                  stamp INTEGER, size INTEGER, active INTEGER, note TEXT DEFAULT '',
                  PRIMARY KEY(library,id));
                CREATE TABLE IF NOT EXISTS tags (
                  library TEXT, id TEXT, name TEXT, PRIMARY KEY(library,id), UNIQUE(library,name));
                CREATE TABLE IF NOT EXISTS migrations (library TEXT PRIMARY KEY);
                CREATE TABLE IF NOT EXISTS memberships (
                  library TEXT, tag TEXT, photo TEXT, position INTEGER,
                  PRIMARY KEY(library,tag,photo));
            ''')

    def connect(self):
        db = sqlite3.connect(self.db, timeout=30)
        db.row_factory = sqlite3.Row
        return db

    def libraries(self):
        with closing(self.connect()) as db:
            return [dict(r) for r in db.execute('SELECT * FROM libraries ORDER BY opened DESC')]

    def snapshot(self, library):
        with closing(self.connect()) as db:
            lib = db.execute('SELECT * FROM libraries WHERE id=?', (library,)).fetchone()
            if not lib:
                raise ValueError('找不到这个目录，请重新打开。')
            photos = [dict(r) for r in db.execute(
                'SELECT id,filename,width,height,note,stamp,size FROM photos WHERE library=? AND active=1 ORDER BY filename', (library,))]
            members = {}
            for r in db.execute('SELECT tag,photo,position FROM memberships WHERE library=?', (library,)):
                members.setdefault(r['photo'], {})[r['tag']] = r['position']
            for i, photo in enumerate(photos, 1):
                photo['number'] = i
                photo['version'] = f"{photo.pop('stamp')}-{photo.pop('size')}"
                photo['tags'] = members.get(photo['id'], {})
            return dict(library=dict(lib), photos=photos,
                        tags=[dict(r) for r in db.execute('SELECT id,name FROM tags WHERE library=? ORDER BY rowid', (library,))])

    def scan(self, raw_path, recursive=False):
        if not isinstance(raw_path, str) or not raw_path.strip():
            raise ValueError('请输入服务器上的照片目录。')
        root = Path(raw_path).expanduser().resolve(strict=True)
        if not root.is_dir():
            raise ValueError('这个路径不是目录。')
        if root == self.state or self.state in root.parents:
            raise ValueError('请选择照片目录，不要选择服务的缓存目录。')
        library = identity(str(root))
        found, skipped = [], []
        paths = sorted(root.rglob('*') if recursive else root.iterdir())
        for path in paths:
            if path.suffix.lower() not in FORMATS or not path.is_file():
                continue
            resolved = path.resolve()
            if not within(resolved, root) or within(resolved, self.state):
                continue
            relative = path.relative_to(root).as_posix()
            try:
                stat = path.stat()
                with Image.open(path) as im:
                    width, height = im.size
                    if im.getexif().get(274, 1) in (5, 6, 7, 8):
                        width, height = height, width
                found.append((library, identity(relative), relative, width, height, stat.st_mtime_ns, stat.st_size))
            except (OSError, ValueError, Image.DecompressionBombError) as error:
                skipped.append({'filename': relative, 'reason': str(error)})
        with self.lock, closing(self.connect()) as db, db:
            db.execute('INSERT INTO libraries VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET recursive=excluded.recursive,opened=excluded.opened',
                       (library, str(root), int(recursive)))
            db.execute('UPDATE photos SET active=0 WHERE library=?', (library,))
            db.executemany('''INSERT INTO photos(library,id,filename,width,height,stamp,size,active)
                VALUES(?,?,?,?,?,?,?,1) ON CONFLICT(library,id) DO UPDATE SET
                width=excluded.width,height=excluded.height,stamp=excluded.stamp,size=excluded.size,active=1''', found)
        result = self.snapshot(library)
        result['skipped'] = skipped
        return result

    def seed(self, library, path):
        """Explicit, one-time migration; never overwrite an existing catalog."""
        entries = json.loads(Path(path).read_text())
        with self.lock, closing(self.connect()) as db, db:
            if db.execute('SELECT 1 FROM migrations WHERE library=?', (library,)).fetchone() or db.execute('SELECT 1 FROM tags WHERE library=?', (library,)).fetchone():
                return
            db.execute('INSERT INTO migrations VALUES(?)', (library,))
            themes = {}
            for entry in entries:
                photo = identity(entry['filename'])
                if not db.execute('SELECT 1 FROM photos WHERE library=? AND id=?', (library, photo)).fetchone():
                    continue
                name = entry['theme']
                if name not in themes:
                    themes[name] = uuid.uuid4().hex
                    db.execute('INSERT INTO tags VALUES(?,?,?)', (library, themes[name], name))
                db.execute('INSERT OR IGNORE INTO memberships VALUES(?,?,?,?)',
                           (library, themes[name], photo, int(entry.get('sequence', 0))))
                db.execute('UPDATE photos SET note=? WHERE library=? AND id=?', (entry.get('note', ''), library, photo))

    def mutate(self, action, body):
        library = body.get('library')
        with self.lock, closing(self.connect()) as db, db:
            if not db.execute('SELECT 1 FROM libraries WHERE id=?', (library,)).fetchone():
                raise ValueError('找不到当前目录。')
            tag = body.get('tag')
            if action in ('rename', 'delete', 'assign', 'remove'):
                if not db.execute('SELECT 1 FROM tags WHERE library=? AND id=?', (library, tag)).fetchone():
                    raise ValueError('主题已不存在，请刷新页面。')
            if action in ('create', 'rename'):
                name = body.get('name', '')
                if not isinstance(name, str) or not 1 <= len(name.strip()) <= 60:
                    raise ValueError('主题名请使用 1–60 个字符。')
                name = name.strip()
                if action == 'create':
                    db.execute('INSERT INTO tags VALUES(?,?,?)', (library, uuid.uuid4().hex, name))
                else:
                    db.execute('UPDATE tags SET name=? WHERE library=? AND id=?', (name, library, tag))
            elif action == 'delete':
                db.execute('DELETE FROM memberships WHERE library=? AND tag=?', (library, tag))
                db.execute('DELETE FROM tags WHERE library=? AND id=?', (library, tag))
            elif action in ('assign', 'remove'):
                ids = body.get('photos')
                if not isinstance(ids, list) or not ids or len(ids) > 10000 or any(not isinstance(i, str) for i in ids):
                    raise ValueError('请选择照片。')
                ids = list(dict.fromkeys(ids))
                for photo in ids:
                    if not db.execute('SELECT 1 FROM photos WHERE library=? AND id=? AND active=1', (library, photo)).fetchone():
                        raise ValueError('照片已不存在，请重新扫描目录。')
                if action == 'assign':
                    position = db.execute('SELECT COALESCE(MAX(position),0) FROM memberships WHERE library=? AND tag=?', (library, tag)).fetchone()[0]
                    for offset, photo in enumerate(ids, 1):
                        db.execute('INSERT OR IGNORE INTO memberships VALUES(?,?,?,?)', (library, tag, photo, position+offset))
                else:
                    db.executemany('DELETE FROM memberships WHERE library=? AND tag=? AND photo=?', [(library, tag, p) for p in ids])
            else:
                raise ValueError('未知操作。')
        return self.snapshot(library)

    def image(self, library, photo, size):
        with closing(self.connect()) as db:
            row = db.execute('SELECT p.*,l.path FROM photos p JOIN libraries l ON p.library=l.id WHERE p.library=? AND p.id=? AND p.active=1', (library, photo)).fetchone()
        if not row:
            raise FileNotFoundError('找不到照片')
        path = (Path(row['path']) / row['filename']).resolve(strict=True)
        if not within(path, Path(row['path'])):
            raise ValueError('照片不在已打开的目录内。')
        stat = path.stat()
        key = identity(f'{library}/{photo}/{stat.st_mtime_ns}/{stat.st_size}/{size}/v1')
        cached = self.state / 'cache' / (key + '.jpg')
        if not cached.exists():
            with self.image_slots:
                if not cached.exists():
                    bounds = (640, 520) if size == 'thumb' else (2000, 1600)
                    with Image.open(path) as im:
                        profile = im.info.get('icc_profile')
                        im.draft('RGB', bounds)
                        im = ImageOps.exif_transpose(im)
                        im.thumbnail(bounds)
                        if profile:
                            try:
                                im = ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(profile)), ImageCms.createProfile('sRGB'), outputMode='RGB')
                            except (OSError, ValueError, ImageCms.PyCMSError):
                                im = im.convert('RGB')
                        else:
                            im = im.convert('RGB')
                        temporary = cached.with_suffix('.' + uuid.uuid4().hex + '.tmp')
                        im.save(temporary, 'JPEG', quality=87 if size == 'thumb' else 93)
                        os.replace(temporary, cached)
        return cached.read_bytes()


class Handler(BaseHTTPRequestHandler):
    def reply(self, code, data, mime='application/json; charset=utf-8', cache='no-store'):
        if not isinstance(data, bytes):
            data = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', cache)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def allowed(self):
        host = self.headers.get('Host', '').split(':')[0]
        if host not in ('127.0.0.1', 'localhost'):
            self.reply(403, {'error': '请通过 localhost SSH 转发访问。'})
            return False
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + self.headers.get('Host'):
            self.reply(403, {'error': '不接受跨站请求。'})
            return False
        return True

    def do_GET(self):
        if not self.allowed():
            return
        parsed = urlparse(self.path)
        args = parse_qs(parsed.query)
        try:
            if parsed.path == '/api/config':
                self.reply(200, {'defaultPath': self.server.default_path, 'libraries': self.server.store.libraries()})
            elif parsed.path == '/api/library':
                self.reply(200, self.server.store.snapshot(args.get('id', [''])[0]))
            elif parsed.path == '/api/image':
                size = 'thumb' if args.get('size', ['thumb'])[0] == 'thumb' else 'preview'
                self.reply(200, self.server.store.image(args.get('library', [''])[0], args.get('photo', [''])[0], size), 'image/jpeg', 'private, max-age=31536000, immutable')
            elif parsed.path in ('/', '/review.html', '/app.js', '/style.css'):
                filename = {'/': 'index.html', '/review.html': 'index.html'}.get(parsed.path, parsed.path[1:])
                mime = 'text/html; charset=utf-8' if filename.endswith('html') else 'text/javascript; charset=utf-8' if filename.endswith('js') else 'text/css; charset=utf-8'
                self.reply(200, (WEB / filename).read_bytes(), mime)
            else:
                self.reply(404, {'error': 'Not found'})
        except (OSError, ValueError) as error:
            self.reply(400, {'error': str(error)})

    def do_POST(self):
        if not self.allowed():
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 1024 * 1024:
                raise ValueError('请求过大或为空。')
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError('请求格式错误。')
            if self.path == '/api/open':
                result = self.server.store.scan(body.get('path'), bool(body.get('recursive', False)))
            elif self.path.startswith('/api/tags/'):
                result = self.server.store.mutate(self.path.rsplit('/', 1)[-1], body)
            else:
                self.reply(404, {'error': 'Not found'})
                return
            self.reply(200, result)
        except sqlite3.IntegrityError:
            self.reply(400, {'error': '这个主题名已存在。'})
        except (OSError, ValueError, TypeError) as error:
            self.reply(400, {'error': str(error)})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', default='', help='Initial server-side photograph folder')
    parser.add_argument('--state-dir', default=str(Path.home() / '.local/share/photo-review'))
    parser.add_argument('--port', type=int, default=4324)
    parser.add_argument('--seed', help='Import an existing selection.json once into a new catalog')
    args = parser.parse_args()
    store = Store(args.state_dir)
    if args.directory:
        snapshot = store.scan(args.directory)
        if args.seed:
            store.seed(snapshot['library']['id'], args.seed)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.daemon_threads = True
    server.store, server.default_path = store, str(Path(args.directory).resolve()) if args.directory else ''
    print(f'Photo review: http://127.0.0.1:{args.port}/review.html', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
