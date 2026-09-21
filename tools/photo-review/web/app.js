const $ = (id) => document.getElementById(id);
let data = null,
  filter = 'all',
  selected = new Set(),
  busy = false,
  currentPhoto = null,
  nameMode = 'create';
let toastTimer;
const node = (tag, text, className) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
};
function tell(text, error = false) {
  clearTimeout(toastTimer);
  $('message').textContent = text;
  $('message').className = error ? 'error' : '';
  $('message').hidden = false;
  if (!error) toastTimer = setTimeout(() => ($('message').hidden = true), 4500);
}
async function api(path, body) {
  const response = await fetch(
    path,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '服务未响应');
  return result;
}
async function run(label, task) {
  if (busy) {
    tell('正在处理，请稍候。');
    return false;
  }
  busy = true;
  $('save-state').textContent = label;
  document.body.setAttribute('aria-busy', 'true');
  try {
    await task();
    $('save-state').textContent = '已保存到本地';
    return true;
  } catch (error) {
    tell(error.message || '连接中断，请检查服务后重试。', true);
    $('save-state').textContent = '操作未完成';
    return false;
  } finally {
    busy = false;
    document.body.removeAttribute('aria-busy');
  }
}
function visiblePhotos() {
  if (!data) return [];
  const term = $('search').value.toLocaleLowerCase();
  const photos = data.photos.filter(
    (p) =>
      (!term || p.filename.toLocaleLowerCase().includes(term)) &&
      (filter === 'all' ||
        (filter === 'unassigned'
          ? !Object.keys(p.tags).length
          : filter === 'assigned'
            ? Object.keys(p.tags).length
            : Object.hasOwn(p.tags, filter))),
  );
  if (!['all', 'unassigned', 'assigned'].includes(filter))
    photos.sort(
      (a, b) => a.tags[filter] - b.tags[filter] || a.number - b.number,
    );
  return photos;
}
function imageURL(photo, size = 'thumb') {
  return `/api/image?${new URLSearchParams({ library: data.library.id, photo: photo.id, size, v: photo.version })}`;
}
function adopt(result) {
  data = result;
  selected = new Set(
    [...selected].filter((id) => data.photos.some((p) => p.id === id)),
  );
  if (
    !['all', 'unassigned', 'assigned'].includes(filter) &&
    !data.tags.some((t) => t.id === filter)
  )
    filter = 'all';
  localStorage.setItem('photo-review-library', data.library.id);
  $('folder').value = data.library.path;
  $('recursive').checked = !!data.library.recursive;
  render();
  if (currentPhoto) renderPhoto();
}
async function refreshRecent() {
  const config = await api('/api/config');
  $('recent').replaceChildren(new Option('最近打开的目录', ''));
  config.libraries.forEach((l) => {
    const option = new Option(l.path, l.id);
    option.dataset.path = l.path;
    option.dataset.recursive = l.recursive;
    $('recent').append(option);
  });
  return config;
}
async function openFolder(path, recursive) {
  await run('正在扫描照片目录…', async () => {
    const result = await api('/api/open', { path, recursive });
    filter = 'all';
    selected.clear();
    $('search').value = '';
    currentPhoto = null;
    $('lightbox').close();
    adopt(result);
    await refreshRecent();
    const skipped = result.skipped || [];
    tell(
      skipped.length
        ? `已读取 ${result.photos.length} 张；${skipped.length} 个文件无法读取：${skipped
            .slice(0, 3)
            .map((p) => p.filename)
            .join('、')}`
        : `已读取 ${result.photos.length} 张照片。`,
      !!skipped.length,
    );
  });
}
async function mutation(action, values, message) {
  if (!data) return false;
  return run('正在保存…', async () => {
    const result = await api('/api/tags/' + action, {
      library: data.library.id,
      ...values,
    });
    adopt(result);
    if (message) tell(message);
  });
}
function chooseFilter(id) {
  filter = id;
  selected.clear();
  render();
}
function renderTags() {
  $('tags').replaceChildren();
  const counts = {
    all: data.photos.length,
    unassigned: data.photos.filter((p) => !Object.keys(p.tags).length).length,
    assigned: data.photos.filter((p) => Object.keys(p.tags).length).length,
  };
  const choices = [
    { id: 'all', name: '全部照片' },
    { id: 'unassigned', name: '未归类' },
    { id: 'assigned', name: '已归类' },
    ...data.tags,
  ];
  choices.forEach((tag, i) => {
    if (i === 3) $('tags').append(node('div', '', 'tag-divider'));
    const button = node('button', undefined, 'tag-button');
    button.dataset.tag = tag.id;
    button.setAttribute('aria-pressed', String(filter === tag.id));
    button.append(
      node('span', tag.name),
      node(
        'span',
        String(
          counts[tag.id] ??
            data.photos.filter((p) => Object.hasOwn(p.tags, tag.id)).length,
        ),
      ),
    );
    button.onclick = () => chooseFilter(tag.id);
    if (i >= 3) {
      button.title = '拖入照片加入此主题；点击查看';
      button.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        button.classList.add('drop-over');
      };
      button.ondragleave = (e) => {
        if (!button.contains(e.relatedTarget))
          button.classList.remove('drop-over');
      };
      button.ondrop = async (e) => {
        e.preventDefault();
        button.classList.remove('drop-over');
        try {
          const payload = JSON.parse(
            e.dataTransfer.getData('application/x-photo-review'),
          );
          if (payload.library !== data.library.id)
            throw new Error('请使用当前目录里的照片。');
          await mutation(
            'assign',
            { tag: tag.id, photos: payload.photos },
            `已加入「${tag.name}」`,
          );
        } catch (error) {
          tell(error.message || '请从画廊内拖动照片。', true);
        }
      };
    }
    $('tags').append(button);
  });
  const oldTarget = $('target-tag').value;
  $('target-tag').replaceChildren(
    new Option(data.tags.length ? '选择主题…' : '先创建一个主题', ''),
  );
  data.tags.forEach((t) => $('target-tag').append(new Option(t.name, t.id)));
  if (data.tags.some((t) => t.id === oldTarget))
    $('target-tag').value = oldTarget;
}
function selectionUI() {
  const visible = visiblePhotos();
  $('selection-count').textContent = selected.size
    ? `已选 ${selected.size} 张`
    : '未选择照片';
  $('select-all').checked =
    visible.length > 0 && visible.every((p) => selected.has(p.id));
  $('select-all').indeterminate =
    visible.some((p) => selected.has(p.id)) && !$('select-all').checked;
  $('assign-selected').disabled = !selected.size || !$('target-tag').value;
  $('clear-selection').disabled = !selected.size;
  $('remove-selected').disabled = !selected.size;
  document.querySelectorAll('.card').forEach((card) => {
    const checked = selected.has(card.dataset.photo);
    card.classList.toggle('selected', checked);
    card.querySelector('input').checked = checked;
  });
}
function render() {
  if (!data) return;
  renderTags();
  const theme = data.tags.find((t) => t.id === filter);
  $('heading').textContent =
    theme?.name ||
    { all: '全部照片', unassigned: '未归类', assigned: '已归类' }[filter];
  for (const id of ['rename-tag', 'delete-tag', 'remove-selected'])
    $(id).hidden = !theme;
  const photos = visiblePhotos();
  $('count').textContent =
    `${photos.length} 张照片${$('search').value ? ' · 搜索结果' : ''}`;
  $('grid').replaceChildren();
  for (const photo of photos) {
    const card = node('article', undefined, 'card');
    card.dataset.photo = photo.id;
    card.draggable = true;
    const label = node('label', undefined, 'check'),
      check = node('input');
    check.type = 'checkbox';
    check.setAttribute('aria-label', `选择 ${photo.filename}`);
    check.onchange = () => {
      if (check.checked) selected.add(photo.id);
      else selected.delete(photo.id);
      selectionUI();
    };
    label.append(check);
    const opener = node('button', undefined, 'image-button');
    opener.setAttribute('aria-label', `查看 ${photo.filename}`);
    const img = node('img');
    img.src = imageURL(photo);
    img.alt = photo.filename;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    img.onerror = () => {
      img.alt = '无法读取：' + photo.filename;
    };
    opener.append(img);
    opener.onclick = () => showPhoto(photo.id);
    const caption = node('div', undefined, 'card-caption');
    caption.append(
      node('span', String(photo.number).padStart(3, '0'), 'number'),
      node('span', photo.filename, 'filename'),
    );
    const badges = node('div', undefined, 'badges');
    const tags = data.tags.filter((t) => Object.hasOwn(photo.tags, t.id));
    if (tags.length)
      tags.forEach((t) => badges.append(node('span', t.name, 'badge')));
    else badges.append(node('span', '未归类', 'badge empty'));
    card.append(opener, label, caption, badges);
    card.ondragstart = (e) => {
      if (busy) {
        e.preventDefault();
        return;
      }
      const ids = selected.has(photo.id) ? [...selected] : [photo.id];
      e.dataTransfer.setData(
        'application/x-photo-review',
        JSON.stringify({ library: data.library.id, photos: ids }),
      );
      e.dataTransfer.setData('text/plain', `${ids.length} 张照片`);
      e.dataTransfer.effectAllowed = 'copy';
      card.classList.add('dragging');
    };
    card.ondragend = () => {
      card.classList.remove('dragging');
      document
        .querySelectorAll('.drop-over')
        .forEach((e) => e.classList.remove('drop-over'));
    };
    $('grid').append(card);
  }
  $('empty').hidden = photos.length > 0;
  $('empty').textContent = $('search').value
    ? '没有匹配的文件名。'
    : !data.photos.length
      ? '目录里没有可读取的照片。支持 JPEG、PNG、WebP、TIFF、BMP；可勾选包含子文件夹后重新扫描。'
      : filter === 'unassigned'
        ? '所有照片都已归类。'
        : '这里还没有照片。返回「全部照片」，将照片拖到左侧主题即可。';
  selectionUI();
}
function showPhoto(id) {
  currentPhoto = id;
  renderPhoto();
  if (!$('lightbox').open) $('lightbox').showModal();
}
function renderPhoto() {
  const photo = data.photos.find((p) => p.id === currentPhoto);
  if (!photo) {
    $('lightbox').close();
    currentPhoto = null;
    return;
  }
  $('photo-title').textContent =
    `${String(photo.number).padStart(3, '0')} · ${photo.filename}`;
  const url = imageURL(photo, 'preview');
  if ($('large-photo').getAttribute('src') !== url) $('large-photo').src = url;
  $('large-photo').alt = photo.filename;
  $('photo-size').textContent = `${photo.width} × ${photo.height}`;
  $('photo-note').textContent = photo.note || '';
  $('photo-tags').replaceChildren();
  if (!data.tags.length)
    $('photo-tags').append(node('span', '关闭大图后，点击左侧 ＋ 创建主题。'));
  for (const tag of data.tags) {
    const label = node('label'),
      check = node('input');
    check.type = 'checkbox';
    check.checked = Object.hasOwn(photo.tags, tag.id);
    check.onchange = async () => {
      const success = await mutation(check.checked ? 'assign' : 'remove', {
        tag: tag.id,
        photos: [photo.id],
      });
      if (!success) renderPhoto();
    };
    label.append(check, document.createTextNode(tag.name));
    $('photo-tags').append(label);
  }
  const list = visiblePhotos(),
    i = list.findIndex((p) => p.id === currentPhoto);
  $('previous-photo').disabled = i <= 0;
  $('next-photo').disabled = i < 0 || i >= list.length - 1;
}
function stepPhoto(delta) {
  const list = visiblePhotos(),
    i = list.findIndex((p) => p.id === currentPhoto);
  if (i >= 0 && list[i + delta]) showPhoto(list[i + delta].id);
}
$('open-folder').onsubmit = (e) => {
  e.preventDefault();
  openFolder($('folder').value, $('recursive').checked);
};
$('recent').onchange = async () => {
  const option = $('recent').selectedOptions[0];
  if (option.value)
    await openFolder(option.dataset.path, option.dataset.recursive === '1');
};
$('search').oninput = () => {
  selected.clear();
  render();
};
$('select-all').onchange = () => {
  for (const p of visiblePhotos()) {
    if ($('select-all').checked) selected.add(p.id);
    else selected.delete(p.id);
  }
  selectionUI();
};
$('target-tag').onchange = selectionUI;
$('assign-selected').onclick = () =>
  mutation(
    'assign',
    { tag: $('target-tag').value, photos: [...selected] },
    '已加入主题。',
  );
$('remove-selected').onclick = () =>
  mutation(
    'remove',
    { tag: filter, photos: [...selected] },
    '已从主题移除，原片仍然保留。',
  );
$('clear-selection').onclick = () => {
  selected.clear();
  selectionUI();
};
function nameDialog(mode) {
  if (!data) {
    tell('请先打开照片目录。');
    return;
  }
  nameMode = mode;
  $('name-error').textContent = '';
  $('name-title').textContent = mode === 'create' ? '新建主题' : '重命名主题';
  $('tag-name').value =
    mode === 'create' ? '' : data.tags.find((t) => t.id === filter).name;
  $('name-dialog').showModal();
  $('tag-name').focus();
}
$('new-tag').onclick = () => nameDialog('create');
$('rename-tag').onclick = () => nameDialog('rename');
$('cancel-name').onclick = () => $('name-dialog').close();
$('name-form').onsubmit = async (e) => {
  e.preventDefault();
  const ok = await mutation(
    nameMode,
    { name: $('tag-name').value, tag: filter },
    '主题已保存。',
  );
  if (ok) $('name-dialog').close();
  else $('name-error').textContent = $('message').textContent;
};
$('delete-tag').onclick = () => {
  const tag = data.tags.find((t) => t.id === filter);
  if (
    tag &&
    confirm(`删除主题「${tag.name}」？只移除这个主题的归类，不会删除照片。`)
  )
    mutation('delete', { tag: tag.id }, '主题已删除。');
};
$('close-photo').onclick = () => $('lightbox').close();
$('lightbox').onclose = () => (currentPhoto = null);
$('previous-photo').onclick = () => stepPhoto(-1);
$('next-photo').onclick = () => stepPhoto(1);
$('lightbox').onkeydown = (e) => {
  if (e.target.matches('input,select')) return;
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    stepPhoto(-1);
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    stepPhoto(1);
  }
};
(async () => {
  await run('正在连接…', async () => {
    const config = await refreshRecent();
    const saved = localStorage.getItem('photo-review-library');
    const initial =
      config.libraries.find((l) => l.id === saved) ||
      config.libraries.find((l) => l.path === config.defaultPath) ||
      config.libraries[0];
    if (initial)
      adopt(await api('/api/library?id=' + encodeURIComponent(initial.id)));
    else {
      $('folder').value = config.defaultPath;
      $('save-state').textContent = '选择目录开始';
    }
  });
})();
