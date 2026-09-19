# 本机环境检查 · 2026-09-19

本报告记录实际检查结果。尚未安装新的前端依赖、运行新站构建或进行浏览器渲染性能测试。

## 仓库

| 项目 | 结果 |
| --- | --- |
| 当前目录初始状态 | 空目录，无 Git 仓库 |
| 旧站 | `/media/pyn/P7000Z/CODE/pz0826.github.io`；Jekyll |
| 原站 remote | `git@github.com:pz0826/pz0826.github.io.git` |
| 本地 main | `c8a5972ee391aade68632759704703f15c1d115a` |
| 远端 main | HTTPS `ls-remote` 确认同一提交；原本“领先 1”来自过期的 origin/main 记录 |
| 旧工作区未跟踪文件 | `_pages/._about.md`；未修改或复制 |
| 新工作区 | 当前目录已创建 linked worktree，分支 `feat/artistic-homepage`，基于上述 main |
| 推送 / 发布 | 本轮未推送、未改变 GitHub Pages 设置 |

默认 GitHub SSH 连接被关闭。HTTPS 读取成功。通过 SSH 443，并使用 `HostKeyAlias=github.com` 匹配本机已有 GitHub 主机信任记录，认证成功，返回用户 `pz0826`。没有修改全局 SSH 配置或仓库 remote；SSH 客户端自动记录了这次连接对应的 IP 主机项。

后续可对单次 Git 命令指定连接方式：

```bash
git -c core.sshCommand='ssh -p 443 -o Hostname=ssh.github.com -o HostKeyAlias=github.com -o StrictHostKeyChecking=yes -o BatchMode=yes' ls-remote --heads origin
```

## 硬件与基础工具

| 项目 | 结果 |
| --- | --- |
| 系统 | Linux 5.15.0-139-generic x86_64 |
| 内存 | 31 GiB，总检查时可用约 17 GiB |
| GPU | RTX 4090，24,564 MiB，驱动 535.183.01 |
| 工作盘空间 | 约 1.2 TiB 可用 |
| 系统 Node / npm | 20.19.4 / 10.8.2 |
| conda | `/home/pyn/anaconda3/bin/conda`，当前 shell PATH 未加载 |
| 浏览器 | Google Chrome、Firefox 存在；已缓存 Playwright Chromium 1124 |
| ripgrep | 当前 PATH 不存在；本轮使用 find / grep 替代 |
| npm registry | 能查询 Astro / React integration / Spark 包元信息 |

浏览器存在不表示浏览器 WebGL 已验证；旧 Playwright 缓存也不保证匹配后续安装的 Playwright 版本。

## Python 与 GPU 实测

| 环境 | 版本 | 实际结果 |
| --- | --- | --- |
| lego | Python 3.11.11；PyTorch 2.5.1；CUDA 12.1；NumPy 2.0.1；Pillow 11.1.0 | CUDA 可见，GPU 张量计算通过 |
| dinov2 | Python 3.9.21；PyTorch 2.0.0；CUDA 11.7；NumPy 1.26.4；Pillow 11.1.0 | CUDA 可见，GPU 张量计算通过；本地 DINOv2 推理通过 |

`dinov2` 不是该环境中直接可 import 的已安装包；本轮通过 `/home/pyn/CODE/dinov2` 源码导入。使用缓存 `dinov2_vits14_reg4_pretrain.pth`，权重键完全匹配；零张量输入 `[1,3,224,224]` 的 GPU 前向输出 patch tokens `[1,256,384]`，数值均有限。这是环境 smoke test，不是摄影效果验收。运行有 xFormers 可用提示和 PyTorch TypedStorage 弃用提示，没有阻断错误。

本机还存在 DINOv2 B/L 及 DINOv3 L 的缓存权重，尚未测试这些配置。没有下载模型、重新训练或更改现有 conda 依赖。

## 研究数据检查

LEGO 路径：`/home/pyn/CODE/LEGO`。当前 viewer 使用 `rasterization_2dgs`。

旧检查样本：`outputs/3d_ovs/room`。

- 层级 checkpoint 大小约 269.8 MiB；读取 tensor 形状使用 CPU mmap，不执行训练。
- `means` `[281814,3]`，`quats` `[281814,4]`，`scales` `[281814,3]`，`sh0` `[281814,1,3]`，`shN` `[281814,15,3]`。
- `hiera_feat` `[281814,8,8]`；标签 `[281814,6]`；CLIP 节点特征 `[26,1280]`。
- 树使用旧格式；checkpoint / 标签没有当前 loader 要求的 schema 元信息。
- 此样本没有 `relation_graph.npz`。
- `.lego/stages/build-tree.json` 记录了对应 checkpoint、旧层号与聚类参数，可作为后续转换依据。

另外发现 `outputs/cor/{counter,kitchen,teatime}` 同时存在标签、树、关系图与 CLIP 特征文件；这里只确认存在，未确认查询有效性或画面质量。收到用户“已有选定结果”的答复后，停止扩大筛选。正式场景和摄影原片路径待用户补充。

## 下一轮需要实际运行的检查

1. 独立 Node >=22.12.0 + 前端依赖安装与静态构建。
2. 正式场景版本与 entity / label / PCA 对应验证；浏览器与原 renderer 的固定相机对照。
3. WebGL 初始化、GPU 加速、shader 与拾取；真实手机帧时间和手势。
4. 摄影真实样本 DINO / PCA 与 Canvas 显影效果，以及 lightbox 的预览衔接。

对应工作顺序和验收条件见 `homepage-engineering-v0.1.md`。
