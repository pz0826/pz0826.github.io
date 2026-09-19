# Mip-NeRF 360 room 实验审计与复用决定

日期：2026-09-20。结论：保留的发布模型完整、性能与论文接近，重新评估与历史发布结果完全一致，直接复用。没有重跑训练。

后续决定：用户补充开发仓库路径后，已恢复原 demo 的 5 层场景和 11 条缓存查询。主页首选改为该展示资源，本文开源版模型作为已验证的备用，详见 `room-demo-resources-2026-09-20.md`。

## 论文与本地结果

论文来源：[LEGO arXiv v1，Table 4 / Table 6](https://arxiv.org/html/2608.10057v1)。此处只比较 **Mip-NeRF 360 room**，不是 3D-OVS room 或 SPIn-NeRF room。

| 结果 | 分割 mIoU (%) | 定位 mAcc (%) | 说明 |
| --- | ---: | ---: | --- |
| 论文 room | 67.3 | 93.1 | Table 4，与 Table 6 完整方法一致 |
| 本地正式发布 `outputs_room_factor2` | 67.6994 | 89.6552 | 29 查询；semantic factor=2、eval factor=2、smoothing ratio=0.0535 |
| 2026-09-20 重新评估 | 67.6994 | 89.6552 | 当前代码运行；全部 29 项 IoU / 定位结果与历史记录一致 |
| 较早完整实验 `outputs_level_v2` | 68.4991 | 93.1034 | semantic factor=4、eval factor=4；不同协议设置，不据此宣称优于论文 |
| 调试 sem4 / eval2 | 68.3185 | 86.2069 | 下采样与平滑设置会影响定位峰值 |
| 调试 sem4 / eval2 / 固定 60 px | 68.8902 | 93.1034 | 历史调参记录，不替代统一发布设置 |

发布结果相对论文为 mIoU **+0.40 个百分点**、定位 mAcc **-3.44 个百分点**。本地 26/29 正确定位；论文四舍五入的 93.1% 与同样 29 项中的 27/29 一致，但没有论文逐项输出，因此不能断言具体是哪一道改变了结果。

选择发布结果作为主页基线，是因为已有明确发布登记、可复现配置和完整数据；不挑选不同后处理设置下的最高分。该差异不足以支持重跑数小时训练；已有 checkpoint 也提供了全部 8 层学习特征。

重要边界：这些是普通短文本 CLIP 定位 / 分割指标。论文的 CoR 定量表包含 teatime、kitchen、bonsai、counter，**没有 room**；因此 room 的多步空间查询仍需单独挑选与验证。构建关系图也不等于复杂查询效果已经通过验证。

## 找到的调试日志与来源

- `/home/pyn/CODE/LEGO/outputs/FINAL_RESULTS.md`：明确将 `outputs_room_factor2/mipnerf360/room` 登记为 room 发布模型。
- `/home/pyn/CODE/LEGO/outputs/TUNING_HISTORY.md`：Mip-NeRF 360 Factor Checks，以及 2026-08-09 Recursive clustering scalability。
- `/home/pyn/CODE/LEGO/outputs_level_v2/mipnerf360/room/.lego/stages/train-rgb.json`：完整 30,000 步 RGB 训练记录。
- 同目录 `train-features.json`：完整 10,000 步、8 层特征训练记录，2026-07-20 完成。
- 同目录 `build-tree.json`：实际 `--end_level 3`；不能仅凭其他 resolved config 中的 6 层设置推断已有 6 层聚类。
- `/home/pyn/CODE/LEGO/outputs_room_factor2/mipnerf360/eval/room/{command.json,eval.log,metrics.json}`：历史发布评估。
- `/home/pyn/CODE/LEGO/outputs_level_v2/mipnerf360/eval/room/metrics.json`：较早的完整实验结果。
- `/home/pyn/CODE/LEGO/outputs_room_factor_cross/`：分辨率 / 平滑核交叉实验。

历史递归聚类加速实验记录 room 为 65.494% mIoU / 93.103% mAcc；记录的 level-2 ARI=0.99996、NMI=0.99993。这说明某些看似调试目录也来自完整模型的下游对照，目录名本身不能判断是否 smoke test。本轮没有选择这些加速实验产物。

## 文件完整性与模型质量

实际 checkpoint：

```text
/home/pyn/CODE/LEGO/outputs_level_v2/mipnerf360/room/ckpts/
  ckpt_hiera_9999_20260720_083437.pt
```

`outputs_room_factor2/mipnerf360/room/ckpts` 原本是指向上述目录的有效软链接；所以即使其他主实验目录被删除，模型仍在。

- 1,206,145 个高斯；checkpoint schema v2，step=9999。
- `hiera_feat` 为 `[1206145,8,8]`；所有 tensor 均为有限值。
- 聚类标签 `[1206145,3]`，3 个公共层级，656 个树节点（含根）、655 个 CLIP 节点，CLIP 维度 1280。
- checkpoint 与标签行数一致；所有标签 ID 都存在于树和 CLIP 特征中。
- `outputs_level_v2` 与 `outputs_room_factor2` 的树、标签 SHA-256 相同；CLIP 文件不同，对应语义提取分辨率变化。不是两个独立重训模型。
- 原始 images、COLMAP 与查询标注均可访问。
- 已查看保存的 RGB / 8 层特征拼图，确认为带沙发、电视与桌子的 Mip-NeRF 360 room。
- 保存的 RGB 渲染统计为 PSNR 33.38、SSIM 0.9295、LPIPS 0.1567；这里只作为原训练记录，不冒充与论文对齐的独立重建评估。

## 本轮实际执行

1. 用当前开源 evaluator、发布参数和缓存的 PE-Core CLIP 模型重新跑 4 个标注视角、29 道查询，生成完整可视化；evaluator 返回码为 0。
2. 比较新旧逐项结果：最大 IoU 差值 0，定位结果改变数 0。
3. 创建独立主页场景目录，复制 checkpoint、标签、树和 CLIP；逐文件 SHA-256 核对通过。使用普通文件，不依赖原实验的软链接。
4. 用 README pipeline 对应的 `lego.scene_graph.relation_graph` 模块和默认发布参数补建缺失关系图，保留命令与日志。
5. 校验关系图与聚类树的节点、父子关系、层级、对象根完全一致；全部图节点有 CLIP 特征。

新关系图包含 655 节点、58 个第一层对象根、708 条空间对象边、172,269 条外部节点边。图很密，Web demo 必须按当前对象、关系与查询筛选局部子图；边的数量不能视为语义正确性的证据。

## 后续使用的固定目录

```text
/home/pyn/CODE/LEGO/outputs_homepage/mipnerf360/room/
  ckpts/ckpt_hiera_9999_20260720_083437.pt
  clustering/label_matrix.npz
  clustering/cluster_tree.json
  clustering/cluster_features_CLIP.npz
  clustering/relation_graph.npz
  homepage_config.yaml
  source_resolved_config.yaml
  provenance.json
  build_graph_command.json
  build_graph.log
  reference_rgb_and_features.png
```

该目录约 1.2 GiB，是可用于 viewer / Web 导出的研究模型副本，不包含训练中间产物。`provenance.json` 保存来源、校验值、层级信息、图统计与重新评估结果。

重新评估完整输出：

```text
/home/pyn/CODE/LEGO/outputs_homepage_audit/2026-09-20/room-release/
  command.json
  eval.log
  metrics.json
  visualizations/
```

viewer 可使用独立配置启动（本轮没有启动常驻 viewer 服务）：

```bash
cd /home/pyn/CODE/LEGO
/home/pyn/anaconda3/envs/lego/bin/lego viewer \
  /home/pyn/CODE/LEGO/outputs_homepage/mipnerf360/room/homepage_config.yaml \
  --port 8080
```

此配置按真实产物限定 3 层聚类，保留 8 层特征。默认不启动 LLM 查询；后续精选空间查询的计算、核对与演示数据离线制作。

## 对主页工程的影响

- 正式场景已确定为此 Mip-NeRF 360 room，取代前一轮用于环境检查的 3D-OVS 样本。
- 初版对象分析使用真实的 3 层树，特征显示可以从已有的 8 层中选择；不会把 8 层特征假称为 8 层对象分解。
- 普通查询可先核对高 IoU 的 glass bottle、cow plush toy、brown slipper、yellow book 等对象。定位失败的 red Nintendo Switch joy-con controller、keyboard、sequence 不作为首轮精选示例。
- 若精选查询需要当前树未拆出的细部，只重跑相应下游聚类 / 语义步骤并重新评估，无需重新生成 SAM、重建场景或训练 RGB。
- 当前模型仍是由 2DGS renderer 使用的 Gaussian checkpoint；尚未导出浏览器格式。下一步执行 2DGS → Spark 的保真度、资源体积与索引实验。
