# Room demo 展示资源：采用开发版已验证场景

本轮结论：采用 `/home/pyn/CODE/hiera-gs-gsplat/results/mipnerf360/room` 的 direct 特征模型及保存的 demo 查询。前一轮开源版副本保留为备用，不再作为主页 demo 的首选。

## 选择依据

以 `COR-demo.json` 的相机 0、19、24，在同一个 LEGO 环境的 2DGS renderer 中分别渲染旧开发模型与开源模型的 RGB、PCA level 1/3/5。两者处于可直接对照的场景坐标系；每张图为 960×540。

目前这三个视角没有显示出足以推翻选择的明显重建质量差距。两者都有插值视角的模糊与漂浮细节，PCA 颜色本身不能代表质量；旧模型部分区域更平滑，但不是全局定量结论。旧模型的优势是已有更深的分解、配套查询结果和相机，能够直接复现项目展示。此轮无需再训练或聚到 6 层。

对照图：

- `/home/pyn/CODE/LEGO/outputs_homepage_audit/2026-09-20/legacy-comparison/comparison-0.png`
- 同目录 `comparison-19.png`（钢琴）、`comparison-24.png`（瓶子）。
- 同目录 `project-room-piano.png`：从本地 project page 视频的 45.94 秒提取，钢琴两个标志的高亮与本轮重放一致。由于视频有观察段微动，不能把该截图与关键帧当成逐像素相同的相机。

项目页面：[LEGO Room scene tour](https://pz0826.github.io/LEGO-Webpage/)。本地视频为 `/home/pyn/CODE/LEGO-webpage-exp/static/videos/demos/room-agent-1080p60.mp4`；本轮没有下载或重新生成整段远端视频。

## 已理解并保留的运行逻辑

开发仓库实际入口是 `examples/simple_viewer_2dgs.py`，主体已经拆到 `examples/lego_viewer/{app,trajectory,timing,overlay}.py`。我们只需要数据读取、查询着色、相机和特征显色这几部分，不需要移植整个 GUI / 命令系统。

1. `COR-demo.json` 是 schema v4 的 70 秒轨迹，30 个关键帧中有 **11 个带查询的观察关键帧**。
2. 每条保存了 text、语义 chain、10 个有分数的候选结果、每个候选的节点链与最终节点，以及相机 position / wxyz / fov。
3. `app.py:prepare_query_binding` 在结果已保存时直接反序列化，不重新调用 LLM 和 CLIP 搜索。该路径是我们复用的基础。
4. 图基于节点的 Ritter 包围球，相交或中心距离小于 0.2 即相连。它是旧版近邻图，不是新 LEGO 的 typed intra-object / spatial 图。
5. 旧视频高亮全部 10 个候选，按分数从低到高覆盖；分数在本条查询内 min-max 后映射为 0.2–0.9 的红色混合，背景为 0.8 倍 DC RGB。导出保存了这套策略，不擅自只取 top-1。
6. 旧轨迹的 `query.level` 是 UI 级别，**不是候选结果节点的实际层级**；真实层级由树节点决定。

11 条查询所有保存节点均存在、有非空高斯成员、相邻搜索步骤符合重建的旧图。全部查询使用本地 2DGS renderer 重放并生成预览，没有 API 调用。这是缓存结果和展示一致性验证，不是一次新的 CoR benchmark。

## 模型与层级适配

选定 checkpoint：

```text
ckpt_hiera_9999_32d_norm+smooth_direct_12000pt_samplemix_0.5l2_1rfn_pn.pt
```

- 1,064,578 个高斯；特征 `[1064578,8,8]`，属于 direct 模式。
- 标签 `[1064578,5]`：实际有 **5 层聚类**，不是 6 层。
- 2,549 个语义节点、56 个一级对象根；所有节点均有 CLIP 特征。
- 另一个 `ckpt_hiera_6999.pt` 是 gate 模式，不用于本次 bundle；文件名中的旧实验字样不作为格式依据。

适配只处理语义编号与元数据，几何、特征、高斯顺序和节点 ID 均不改变：

| 旧字段 | 统一字段 |
| --- | --- |
| 根节点 level=-1 | 根 scene_level=0 |
| 树节点 level=0…4 | scene_level=1…5 |
| labels[:,0…4] | 公共 level=1…5，列顺序不变 |
| direct feature[:,0…7,:] | 特征 level=1…8 |
| 节点 ID | 完全不变，保存查询仍能直接引用 |

归一化后的 checkpoint / 聚类使用 LEGO schema v2；旧图单独名为 `legacy_adjacency.npz`，不会伪装成新开源版 relation_graph 格式。

## 已准备好的资源目录

```text
/home/pyn/CODE/LEGO/outputs_homepage_legacy/mipnerf360/room/
  manifest.json
  ckpts/room-demo.pt
  clustering/
    label_matrix.npz
    cluster_tree.json
    cluster_features_CLIP.npz
    cluster_features.npz
    legacy_adjacency.npz
  source/
    COR-demo.json
    legacy_cluster_tree.json
  web/
    nodes.json
    queries.json
    semantic_neighbors.json
    pca.json
    pca-level-1.rgb8 … pca-level-8.rgb8
    labels-level-1.i32 … labels-level-5.i32
  previews/
    room-poster.webp
    query-contact-sheet.png
    query-02.png … query-27.png
```

`web/nodes.json` 包含父子关系、中心、半径、AABB 与实体数；`semantic_neighbors.json` 提供 CLIP cosine top-5，作为计算得到的相似度，不表示人工验证的对象名称。旧邻接图约 202 万条无向边，只用于恢复旧结果和离线筛选，不整体塞进网页连线层。

8 层 RGB8 特征色表约 24.37 MiB，5 层 int32 标签约 20.31 MiB，均按原高斯行序存放。`pca.json` 固定每层基准、min-max 与方差，后续选择对象不会改变整场色彩。浏览器应按需加载层级；checkpoint 仍是研究数据，下一步再确定 Web 几何压缩 / 下采样，并同步映射这些侧车文件。

该目录包含独立文件和校验信息，原开发仓库与前一轮开源版副本均未修改。初始 poster 来自轨迹第 0 帧，可用于加载占位；最终首屏构图仍需结合页面调整。

## 查询整理与首批精选

所有原文、候选结果与相机保留在 `web/queries.json`。建议精选 6 条，初屏可先展示其中 3 条，其余在对象选择后提供。

| Keyframe | 主题 | 最佳候选层级 | 建议 |
| --- | --- | ---: | --- |
| 2 | 沙发上的毛绒玩具头部 | 4 | 精选，整体到部件 |
| 4 | Ticket to Ride 桌游 | 5 | 保留；保存链含 stores / retailers，不能直接当成可靠空间解释 |
| 6 | 白色 PlayStation | 1 | 辅助，简单物体查询 |
| 9 | 电视旁照片中的深红衣人物 | 5 | 精选，多步定位 |
| 12 | 花盆标签上的文字 | 4 | 精选，细小部件 |
| 14 | 书架上的温湿度计 | 4 | 保留但不精选，周边书本也有较明显响应 |
| 17 | 钢琴轮子 | 4 | 精选，多个结果部件 |
| 19 | 钢琴品牌标志 | 5 | 精选，与项目视频视觉对应 |
| 21 | 白色 Apple Pencil | 4 | 辅助，细小物体定位 |
| 24 | 蓝盖瓶子 | 5 | 精选，瓶身→瓶盖；旧结果主要突出瓶盖 |
| 27 | 适合抱着玩具蜷缩的软座位 | 1 | 保留，结果范围较大、文字较泛 |

针对新主页的说明性动画，采用这些真实节点和相机来编排选择、层级切换及局部连接。旧语义链并没有存储新 schema 的 typed relations，不能把每条相邻链自动标注成已验证的“inside/on/next to”。原 11 条文本保留；如要把长叙述缩短成入口文字，后续由页面文案层处理。

## 可复现工具

仓库内新增：

- `scripts/inspect_room_models.py`：固定相机双模型 RGB / PCA 对照。
- `scripts/prepare_legacy_room.py`：格式适配、旧图恢复、缓存查询重放、PCA / 标签 / 节点导出。

重建时使用新输出目录，脚本会拒绝覆盖已有 bundle：

```bash
/home/pyn/anaconda3/envs/lego/bin/python scripts/prepare_legacy_room.py \
  --source /home/pyn/CODE/hiera-gs-gsplat/results/mipnerf360/room \
  --checkpoint /home/pyn/CODE/hiera-gs-gsplat/results/mipnerf360/room/ckpts/ckpt_hiera_9999_32d_norm+smooth_direct_12000pt_samplemix_0.5l2_1rfn_pn.pt \
  --output /path/to/new-room-bundle \
  --featured-keyframes 2 9 12 17 19 24
```

本轮资源准备完成；后续进入浏览器渲染适配与页面 demo。摄影资源仍待提供。
