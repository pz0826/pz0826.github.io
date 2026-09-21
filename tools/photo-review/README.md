# Contact Room · 本地摄影选片服务

独立于 Astro 主页的选片工具。Python 3.8+、Pillow 和标准库 SQLite；前端无需构建。

## 启动

在仓库根目录：

```bash
python3 -m pip install -r tools/photo-review/requirements.txt
python3 tools/photo-review/server.py \
  --directory photography-review/originals \
  --state-dir photography-review/.service \
  --port 4324
```

已有依赖时也可以使用 `npm run review:serve`。前台服务按 Ctrl+C 停止。程序只监听服务器的 `127.0.0.1`。

Mac 上保留 SSH 转发：

```bash
ssh -N -L 4324:127.0.0.1:4324 用户名@服务器地址
```

浏览器访问 `http://localhost:4324/review.html`（根路径同样可用）。

## 使用

1. 输入**服务器上的目录路径**，点击“打开 / 重新扫描”。可选择包含子文件夹，也可从最近目录中切换。支持 JPEG、PNG、WebP、TIFF、BMP；RAW 请先导出 JPEG。
2. 点击左侧 ＋ 新建主题。拖动单张照片到主题，或者勾选多张后拖动其中一张，整批加入该主题。也可以用工具栏的“加入主题”。
3. 点击主题查看全部成员。一张照片可以属于多个主题；拖入新主题不会从旧主题移除。
4. 主题内勾选照片后，可“从此主题移除”。大图中的主题复选框也可以添加或移除归类。删除主题不删除照片。
5. 点击照片查看大图，使用左右箭头翻阅当前筛选结果。支持文件名搜索、全选、未归类与已归类视图。
6. 目录新增或删除文件后，重新扫描。临时移走再放回同名相对路径的照片会恢复其分类；重命名被视为新照片。

## 存储和复用

- `--state-dir` 保存 `catalog.sqlite3`（目录、主题、成员关系、组内顺序与迁移的选片备注）和 `cache/`（按需生成的显示图片）。
- 默认状态目录是 `~/.local/share/photo-review`。本项目的 npm 启动命令使用 Git 忽略的 `photography-review/.service`。
- 不同照片目录拥有独立主题。分类按规范化目录路径与相对文件名关联，刷新页面或重启不会丢失。
- 可用新 `--directory` 打开另一批照片；也可在前端直接切换，无需重启服务。
- 原片只读。不会移动、覆盖、调色或向原片写入元数据。缩略图保留画幅和 EXIF 方向，并在有嵌入描述时转换为 sRGB。
- 缓存按源文件修改时间和尺寸更新。状态目录可整体备份；`cache/` 可在服务停止后删除并重建，数据库需保留。
- 只通过已打开目录中的图片 ID 提供预览，不作为任意文件下载服务器；拒绝跨站写入请求。

## 迁移旧选片结果

首次启动新目录时可额外指定：

```bash
--seed photography-review/selection.json
```

这会导入既有三组、20 张候选的顺序和备注。导入标记写入数据库，同一目录不会在以后重启时重新添加已删除的主题。已有主题的目录不自动覆盖。

## 验证

```bash
python3 -m unittest discover -s tools/photo-review -p test_server.py -v
node tests/photo-review-browser.mjs
```

后端覆盖持久化、多标签、删除/移除、目录隔离、递归、重新扫描、损坏文件、EXIF、缓存与旧数据迁移。浏览器测试创建临时照片目录和独立临时端口，验证真实拖放、批量归类、重命名、大图、搜索、目录切换、服务重启及窄屏；不改动真实选片数据。
