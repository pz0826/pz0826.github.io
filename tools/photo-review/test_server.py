import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from PIL import Image
from server import Store


class CatalogTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.folder = self.root / '中文 相册'
        self.folder.mkdir()
        self.photo = self.folder / '01 照片.jpg'
        Image.new('RGB', (120, 80), 'green').save(self.photo)
        (self.folder / 'nested').mkdir()
        Image.new('RGB', (30, 60), 'blue').save(self.folder / 'nested/竖图.png')
        self.before = hashlib.sha256(self.photo.read_bytes()).hexdigest()
        self.store = Store(self.root / 'state')
        self.catalog = self.store.scan(str(self.folder))
        self.lib = self.catalog['library']['id']
        self.pid = self.catalog['photos'][0]['id']

    def tearDown(self):
        self.tmp.cleanup()

    def create(self, name):
        result = self.store.mutate('create', {'library': self.lib, 'name': name})
        return next(t['id'] for t in result['tags'] if t['name'] == name)

    def test_multiple_tags_persist_and_remove_without_touching_originals(self):
        a, b = self.create('山川'), self.create('冷色')
        for tag in (a, b, a):
            self.store.mutate('assign', dict(library=self.lib, tag=tag, photos=[self.pid]))
        reopened = Store(self.root / 'state').scan(str(self.folder))
        self.assertEqual(set(reopened['photos'][0]['tags']), {a, b})
        result = self.store.mutate('remove', dict(library=self.lib, tag=a, photos=[self.pid]))
        self.assertEqual(set(result['photos'][0]['tags']), {b})
        self.store.mutate('rename', dict(library=self.lib, tag=b, name='静水'))
        self.store.mutate('delete', dict(library=self.lib, tag=b))
        self.assertFalse(self.store.snapshot(self.lib)['photos'][0]['tags'])
        self.assertEqual(hashlib.sha256(self.photo.read_bytes()).hexdigest(), self.before)

    def test_paths_recursion_rescan_and_catalog_isolation(self):
        tag = self.create('山川')
        self.store.mutate('assign', dict(library=self.lib, tag=tag, photos=[self.pid]))
        self.assertEqual(len(self.store.scan(str(self.folder), True)['photos']), 2)
        self.assertEqual(len(self.store.scan(str(self.folder))['photos']), 1)
        other = self.root / 'other'
        other.mkdir()
        Image.new('RGB', (30, 40)).save(other / self.photo.name)
        second = self.store.scan(str(other))
        self.assertFalse(second['tags'])
        self.assertFalse(second['photos'][0]['tags'])
        self.photo.rename(self.folder / 'temporarily.txt')
        self.assertFalse(self.store.scan(str(self.folder))['photos'])
        (self.folder / 'temporarily.txt').rename(self.photo)
        self.assertIn(tag, self.store.scan(str(self.folder))['photos'][0]['tags'])

    def test_bad_images_paths_and_transaction_rollback(self):
        (self.folder / 'broken.jpg').write_text('not an image')
        result = self.store.scan(str(self.folder))
        self.assertEqual(len(result['photos']), 1)
        self.assertEqual(len(result['skipped']), 1)
        with self.assertRaises(FileNotFoundError):
            self.store.scan(str(self.root / 'missing'))
        tag = self.create('山川')
        with self.assertRaises(ValueError):
            self.store.mutate('assign', dict(library=self.lib, tag=tag, photos=[self.pid, 'missing']))
        self.assertFalse(self.store.snapshot(self.lib)['photos'][0]['tags'])
        with self.assertRaises(FileNotFoundError):
            self.store.image(self.lib, '../../etc/passwd', 'thumb')
        outside = self.root / 'outside.jpg'
        Image.new('RGB', (5, 5)).save(outside)
        (self.folder / 'link.jpg').symlink_to(outside)
        self.assertEqual(len(self.store.scan(str(self.folder))['photos']), 1)

    def test_migration_and_image_orientation_cache(self):
        seed = self.root / 'selection.json'
        seed.write_text(json.dumps([dict(filename=self.photo.name,theme='山川',sequence=3,note='light')]))
        self.store.seed(self.lib, seed)
        self.store.seed(self.lib, seed)
        self.assertEqual(len(self.store.snapshot(self.lib)['tags']), 1)
        image = self.store.image(self.lib, self.pid, 'thumb')
        self.assertTrue(image.startswith(b'\xff\xd8'))
        self.assertEqual(self.store.image(self.lib, self.pid, 'thumb'), image)
        rotated = self.folder / 'rotated.jpg'
        exif = Image.Exif(); exif[274] = 6
        Image.new('RGB', (100, 60)).save(rotated, exif=exif)
        photo = next(p for p in self.store.scan(str(self.folder))['photos'] if p['filename'] == rotated.name)
        self.assertEqual((photo['width'], photo['height']), (60,100))
        import io
        with Image.open(io.BytesIO(self.store.image(self.lib,photo['id'],'preview'))) as im:
            self.assertEqual(im.size, (60,100))


if __name__ == '__main__':
    unittest.main()
