# 个人主页工程方案 v0.1

日期：2026-09-19。状态：工程建议与实验计划，尚未开始新页面实现。

2026-09-20 更新：正式场景为 **Mip-NeRF 360 room**。先验证了完整发布模型，随后找到开发版项目视频的原模型与 11 条缓存查询。经过同视角对照，主页现优先使用 `/home/pyn/CODE/LEGO/outputs_homepage_legacy/mipnerf360/room`，见 `room-demo-resources-2026-09-20.md`；前一轮开源版副本保留为备用。下文 3D-OVS 样本只保留为早期环境检查记录。

本方案以 `personal-homepage-design-v0.1.md` 为设计讨论基线。附件中的原型参数和候选库不视为已经锁定的技术决定。本轮用户请求是先检查环境、收敛工程方案，再讨论并逐个板块实施。用户已说明有选定的 3D 场景，将补充路径；摄影素材随后提供。

## 1. 建议采用的技术组合

| 部分 | 建议 | 选择依据 / 验证边界 |
| --- | --- | --- |
| 页面与构建 | Astro 静态输出 + TypeScript | 姓名、导航、Info、News、Works 直接生成 HTML；3D 未加载或失败时仍可阅读 |
| 复杂交互 | React island | 首屏的选择、层级、查询共享一个状态域；画廊独立。可以使用 React 动画生态，无须把整页变成 SPA |
| 场景渲染 | Three.js + Spark，封装为可替换适配层 | Spark 的自定义 splat modifier 适合换色和显露实验；2DGS 保真度、语义拾取和 ID 对应关系通过实验后才锁定 |
| 视觉样式 | 原生 CSS、CSS 变量、本地 WOFF2 字体 | 实现 Montserrat / Space Mono、薄导航和角标；不先引入成套 UI 主题 |
| 动画 | CSS / Web Animations；React 编排有需要再加 Motion | 相机、shader 统一使用场景时钟；避免多个动画系统争夺相机和选择状态 |
| 摄影显影 | Canvas 2D 首选，PixiJS PixelateFilter 作对照 | 只在显影期间绘制，完成后交给普通 img；是否引入 PixiJS 由测量决定 |
| 横向画廊 | CSS Grid + 原生 overflow-x | 保留照片比例、固定行高和有限序列；箭头供纯鼠标浏览，不把纵向滚轮改成横移 |
| 放大查看 | PhotoSwipe 首选候选 | 复用缩略图、按需加载原图、缩放与前后切换；验证与显影预览衔接、焦点恢复 |
| 离线处理 | Python；现有 lego / dinov2 conda 环境分别使用 | 导出场景、PCA、节点与查询；DINO 不在浏览器实时计算 |
| 发布 | GitHub Pages 静态产物 | 首版无需常驻 Python、CUDA 或 LLM 服务 |

Astro 的价值是将正文与重交互分开调度，而不是限制特效能力。React + Vite 也能实现，但需要额外处理正文预渲染；Next.js 的服务端能力当前没有直接需求。暂不叠加 React Three Fiber，先把 Spark、相机和 shader 的生命周期直接管理清楚；后续需要其组件生态时可以在 React island 内接入。

npm 当前查询结果为 Astro 7.3.3、@astrojs/react 6.0.6、Spark 2.2.0；这是调研快照，不是安装完成或兼容性验收。Astro 要求 Node >=22.12.0，Spark 要求 Three >=0.180.0。脚手架阶段选择项目专用 Node 版本并生成 lockfile，不修改系统 Node 或现有科研环境。依赖以首轮通过构建和渲染检查的确切版本锁定。

## 2. 模块与加载边界

建议目录在开始实现时建立：

```text
src/
  pages/index.astro
  layouts/Page.astro
  components/{Header,Info,News,Works,Arts}.astro
  content/                 # 身份、经历、论文、照片清单
  features/scene/
    SceneExplorer.tsx      # 控件和状态
    state.ts              # 可接管的操作与查询步骤
    renderer.ts           # 渲染器接口
    spark-renderer.ts     # Spark 专属实现
    camera.ts
  features/gallery/       # 加载、显影、lightbox 分离
  styles/
public/
  fonts/
  media/                  # 网页尺寸的照片、论文封面、视频
  scenes/<scene-id>/       # 导出的发布文件，体积验证后决定托管位置
scripts/
  export_scene.py
  prepare_photos.py
docs/
```

首屏先输出英文身份、导航和有尺寸的场景海报。场景模块在可见且浏览器支持时异步导入；海报由首个可用 3D 帧替换。导航为普通锚点，即使 JS 未加载也能使用；平滑定位和当前 section 角标为增强行为。字体、图片、视频和海报预留尺寸，检查资源到达时锚点位置是否稳定。

画廊靠近视口才预取图像和显影代码。3D 离屏或页面隐藏时停止持续绘制，返回后恢复。动画完毕且相机静止时尽量按需渲染。初始限制 DPR，并根据帧时间降低分辨率。用户的 reduced-motion 偏好关闭扩散、扰动及长过渡。

## 3. 先解决的数据与渲染问题

### 3.1 2DGS → Web 的保真度

LEGO 当前 viewer 调用 `gsplat.rendering.rasterization_2dgs`。Spark 是 3D Gaussian 渲染器，不能用“文件成功加载”代替画面正确。第一步固定 3–5 个相机位，比较原始 viewer 与 Web 的 RGB、轮廓、薄结构、透明边界和遮挡。核对坐标轴、四元数顺序、log-scale / opacity 解码、SH 排列及色彩空间。

允许测试薄椭球近似，但必须记录差异；若重要结构明显失真，则比较支持 surfel / 2DGS 的其他 Web 路线，或单独实现对应渲染适配。首屏暂用真实海报保证页面实施可以继续。是否接受近似由实际对照图讨论决定，不预先替用户降低要求。

### 3.2 数据格式与索引

用于检查的旧样本 `LEGO/outputs/3d_ovs/room` 有 281,814 个实体，特征形状 `[281814,8,8]`，标签矩阵 `[281814,6]`，26 个 CLIP 节点特征。其 checkpoint / 聚类缺少新版 schema 元信息，树根 level=-1，节点从 level=0 开始；当前 LEGO loader 使用 schema v2、root=0 和 1-based scene_level。层数不同也可能源于只聚类部分特征层，不能机械填齐。该样本缺少 relation_graph.npz。

以上只是旧样本审计，不代表用户将提供的最终场景存在同样问题。最终数据到位后验证来源 checkpoint、聚类参数、行顺序和版本，优先使用已有的相互匹配输出。确需旧格式转换时只生成新导出文件，不覆盖科研产物。

建议发布资产包括：

| 文件 | 内容 |
| --- | --- |
| manifest.json | schema、来源标识与校验值、实体数、坐标变换、真实可用层级、初始相机、文件路径 |
| scene.<format> | 一份几何、透明度及 RGB / SH；格式由保真度与体积实验决定 |
| pca-level-*.bin | 各层固定 PCA 基准所得的逐实体 RGB，优先测试 uint8 |
| labels-level-*.bin | 每层 entity → node 的整数映射，明确未分配值 |
| nodes.json | 稳定 ID、经核对的名称、父子关系、边界和代表位置 |
| relations.json | 区分空间邻近和语义相似；记录算法、阈值和来源 |
| queries.json | 人工核对的文本、相关节点、结果、引用的关系及演示步骤 |
| poster.webp | 实际场景的初始构图 |

同一份几何通过 shader 读取当前层的色表。几何压缩、重排或下采样时同步转换标签与色表，并输出映射验证结果。第一轮关闭自动 LoD；LoD 的合并实体需要明确语义归属，不能假设渲染索引等于训练实体 ID。

按 281,814 个实体估算，8 层 RGB8 色表约 6.45 MiB，6 层 Uint32 标签约 6.45 MiB，均不含几何、纹理对齐及解码副本。该计算只是存储量估算，不是实测下载或显存数据；浏览器只上传当前需要的层和索引资源。

### 3.3 拾取与鼠标扰动

Spark 文档提供整组 splat 的射线相交，但不能据此保证直接得到研究节点 ID。其同步逐点 raycast 不适合未经评估就每帧用于 hover。

先比较节流的实体拾取、语义代理几何/BVH 和额外 ID pass。用重叠物体、细腿、半透明边缘及噪声点测试前景选择。精确选择必须基于可见对象的贡献和遮挡；代理只用于加速或候选筛选。

第一轮将“空间扰动”实现为很轻的色彩 / 光照反馈，保持几何不变。若后续希望真实位移，渲染与 ID pass 必须使用相同位移函数；不能让视觉对象移动、拾取仍留在原地。真位移是否值得其复杂度，留到真实场景对照时讨论。

## 4. 统一交互模型

状态至少包含 `representation`、`level`、`selectedNodeId`、`relationMode`、`queryResult`、`camera`、`playback`。UI 事件和查询演示调用同一组操作：选择、切层、关系展开、聚焦、结果突出、清除。

Human / AI 转换只改变底层表示和分析可见性，保留相机与选择。切回 Human 保存分析状态，回到 AI 恢复。局部显露用一个从起点扩张的 shader 场，结束时强制落在纯 RGB 或纯 PCA 端点；快速反向切换从当前进度接续，不能出现半场景停留。

层级对应真实树路径，节点没有更细后代时保持叶子状态。改变当前层后全场更换同一层 PCA。层级不足以支持对象分析时应限制控件范围，并明确区分“特征层”和“已有聚类层”。

查询首版只执行离线核对的示例。手动拖动、选择、切层或切换表示会取消整个自动序列及正在进行的自动相机动画；用取消标记防止异步完成事件重新推进。暂停点保留当前结果，用户继续操作。

建议手机默认以单指纵向滚动页面，显式点击 `Explore` 后进入相机操作，并有清晰的退出入口。桌面默认拖动旋转、显式按钮缩放 / 复位，纵向滚轮保留页面滚动。具体手势在手机原型中验证。

## 5. 摄影处理与显影

照片到位后先选 6–10 张不同横竖比例、明暗与纹理密度的样本。先统一 EXIF 方向和颜色，再生成 DINO 输入、PCA 预览、RGB 缩略图、画廊尺寸及放大尺寸。特征提取使用等比缩放和明确的 padding / 坐标映射，避免中心裁剪导致特征与原图错位。

第一轮使用已验证可运行的 DINOv2 ViT-S/14 register 权重。这只确定实验起点，不预设它优于较大模型或 DINOv3。先比较逐图 PCA 与样本集共享 PCA：前者每张区分更强，后者色彩更统一；用真实选片决定。记录 PCA 基准和归一化参数，重新导出时复现色彩。

Canvas 2D 使用固定原点的嵌套网格（例如短边 16 → 32 → 64 → 128 → 原图），关闭插值保留色块边缘。先在粗网格中 DINO → RGB，再分级细化；下一层只在 decode 完成后启动。完成后卸载 canvas，保留 img，重复进入视口不重播。

测试 400 / 550 / 700 ms、1 / 3 / 6 张并发与冷缓存 / 热缓存 / 慢网。默认最多两张同时显影，余下简化。PixiJS 用同一组素材、尺寸和节奏做对照；只有帧时间或效果收益明确才引入共享 renderer。无可用 DINO 时显示 RGB 预览，失败时保留已加载版本并可重试。

## 6. 逐步实施与验收

以下是工作顺序，不是已经完成的实验结果。版式实验可以在等待正式场景和摄影素材时推进。

| 阶段 | 实验 / 交付 | 通过条件 |
| --- | --- | --- |
| E0 工程骨架 | 项目 Node、Astro / React 构建、正文迁移清单、静态海报 | build 通过；JS 或 WebGL 关闭后身份、论文、导航仍可用 |
| E1 版式 | 姓名 / 定位、薄导航角标、完整的真实论文条目；桌面 / 手机对照 | 信息层级清楚；最长期刊标题与作者列表完整；锚点不被导航遮挡；媒体到达不跳位 |
| E2 场景适配 | 正式数据审计、一个房间 Web 导出、固定相机 RGB 对照 | 格式和索引对应正确；2DGS / Web 差异可接受；报告资源与帧时间 |
| E3 最小交互 | Human / AI、固定层色表、选中 / 取消、相机复位 | 端点纯色表示正确；相机和对象不丢失；拾取与可见对象一致；点击 / 拖动区分 |
| E4 分析闭环 | 真实层级、两类关系、先做 2–3 个已核对查询 | 手动与演示共用行为；任意步骤可接管；无伪造节点名称、空间关系或结果 |
| E5 摄影实验 | 小样本离线导出、Canvas / Pixi 对照、横向画廊与放大 | 对齐正确、色块明确、已加载图不重播、点击即时响应、纵向浏览顺畅 |
| E6 合并与打磨 | 全部正文与选片、渐进加载、键盘 / 触摸 / reduced-motion | 真实移动设备验收；慢网和 WebGL 失败不影响主体信息；资源正确释放 |
| E7 分支交付 | 构建检查、说明、提交并推送实验分支 | 新分支可复现构建；部署行为与原站隔离，正式切换另行决定 |

初始性能预算（待实测修订）：

- 桌面互动帧 p95 尽量 <=20 ms，移动设备 <=33 ms；记录设备、分辨率、DPR、点数与是否 GPU 加速，4090 结果不代表手机性能。
- 静态主体以 LCP <=2.5 s、CLS <=0.1、INP <=200 ms 作为优化目标。实验中的单次输入延迟不冒充正式 INP 数据。
- 首个交互场景传输量先以 <=15 MiB 为试验目标；按层分发附加颜色与标签。达不到时比较裁剪、压缩和分级装载，不牺牲首屏正文加载。
- 性能报告记录传输量、解码时间、主线程长任务、帧 p50/p95 和 CPU 内存。显存若只能按资源分配估算，应标注估算。

测试集中在数据不变量和复杂交互：导出行数与父子引用、PCA 确定性、映射后对象一致性、查询取消竞态、资源失败恢复。使用 Playwright 做锚点 / 键盘 / 资源延迟 / 多视口流程；桌面截图不能代替实体手机的手势和 GPU 验收。不为纯样式值逐条写镜像测试。

## 7. 内容与 Git / 发布

旧站可迁移 5 篇论文、4 条近期动态、2 段教育、5 条奖项和 1 段实习。先保留作者顺序、共同作者标记、完整标题与链接，再精炼英文 TLDR。LEGO 目前使用视频而没有独立 poster，需提取合适封面。首屏定位句、实习职责、论文贡献文字在内容轮核对。

当前目录是原仓库的 linked worktree，分支 `feat/artistic-homepage`，基线 `c8a5972`；旧站 main 和未跟踪文件保持原状。共享 Git 对象与 remote 配置，不在实验中随意修改公共 remote。后续仅提交网页产物和导出工具，不提交科研 checkpoint、照片原片及模型权重。

实验分支先做构建 CI。GitHub Pages 的站点设置尚未检查，不能假设推送新分支自动生成独立预览网址。原站根路径与 LEGO 等项目站点路径需保留；切换构建方式时检查 `/about/`、`/about.html` 等旧入口。最终推送新分支属于用户目标；本轮准备工作尚未推送或更改正式发布设置。

## 8. 需要随后讨论的决定

1. 已选定场景的路径、checkpoint 与配套聚类 / 关系 / 查询结果。收到后优先验证，替代本轮旧样本。
2. 首屏最终英文身份与研究定位句；可先以旧站身份排版，但不把候选文案当定稿。
3. 手机是否采用显式 Explore 模式；建议用它避免房间 canvas 抢走页面滚动。
4. 鼠标扰动是否必须移动几何；建议先看色彩反馈，真实位移须同时解决拾取一致性。
5. 摄影全局 PCA 与逐图 PCA 的艺术取舍，以真实样本对照决定。

## 9. 调研依据

- [Astro islands](https://docs.astro.build/en/concepts/islands/)：静态内容与独立交互区。
- [Astro 安装要求](https://docs.astro.build/en/install-and-setup/)：Node 版本。
- [Astro 部署到 GitHub Pages](https://docs.astro.build/en/guides/deploy/github/)：静态产物与发布配置。
- [Spark SplatMesh](https://sparkjs.dev/docs/splat-mesh/) / [Dyno](https://sparkjs.dev/docs/dyno-overview/)：modifier、索引相关实验、raycast 限制。
- [Spark 源码](https://github.com/sparkjsdev/spark)：后续固定版本核对实际 API。
- [PhotoSwipe](https://photoswipe.com/getting-started/)：预设图像尺寸、渐进加载和动态导入。
- [PixiJS PixelateFilter](https://pixijs.io/filters/docs/PixelateFilter.html)：像素化候选。
- [Motion](https://motion.dev/docs/react)：按需采用的 React 动画能力。
- [LEGO](https://github.com/WHU-USI3DV/LEGO) 和本地 `src/lego/viewer/app.py`、`levels.py`、`scene_graph/artifacts.py`：研究实现与数据格式。
