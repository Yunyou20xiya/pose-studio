# 参考项目与致谢

本工作台在实际的 AI 插画构图需求中逐步形成，由 Yunyou20xiya 提出需求、调整场景和验收，Codex 协助实现、调试与整理。它使用开源渲染和 VRM 组件，也参考了已有姿态编辑器。以下区分运行依赖、改编素材和实现思路，保留上游作者的贡献与许可。

## 直接使用的组件

| 项目 | 在本工作台中的用途 | 许可 |
| --- | --- | --- |
| [Three.js](https://github.com/mrdoob/three.js) 0.183.2 | 三维渲染、数学、OrbitControls、TransformControls。受约束的 CCD 求解参考其 CCDIKSolver 的循环思想，针对本项目骨架和四元数限制重新组织。 | [MIT 原文](licenses/Three.js-MIT.txt) |
| [pixiv / three-vrm](https://github.com/pixiv/three-vrm) 3.5.1 | VRM 角色加载、标准骨架、表情、材质与动画支持。 | [three-vrm MIT](licenses/pixiv-three-vrm.txt)、[动画组件 MIT](licenses/pixiv-three-vrm-animation.txt)，其他子包许可在 licenses 中。 |
| [Vite](https://github.com/vitejs/vite) 8.3.1 | 网页开发和构建。 | [MIT 及依赖说明](licenses/Vite-MIT.txt) |
| [Node.js](https://nodejs.org/) 22.23.3 | 本地服务与 Windows 便携运行时；便携包附官方运行程序，源码仓库不提交二进制运行时。 | [Node.js 与其第三方许可](licenses/Node.js-LICENSE.txt) |

## 参考过的姿态编辑项目

### ZaberKo / vrm-studio

- 项目：[ZaberKo/vrm-studio](https://github.com/ZaberKo/vrm-studio)
- 检查版本：[f919e537171d65c88f8ebfe713f7d1f56aa3a894](https://github.com/ZaberKo/vrm-studio/tree/f919e537171d65c88f8ebfe713f7d1f56aa3a894)
- 原作者署名：Copyright (c) 2026 ZaberKo；[MIT 许可原文](licenses/vrm-studio-MIT.txt)。

开发时阅读了其 VRM 控制、交互和姿态数据组织方式。本项目的命令队列、持久化和约束按自己的场景格式实现。原编辑器没有作为整体嵌入，也没有沿用其停用的关节限制。

公开版动作基础数据来自该固定版本的 `public/pose/A-shape.json`、`Standing.json` 和 `Double Peace.json`：

| 工作台动作 | 来源与处理 |
| --- | --- |
| 自然站立 | A-shape；VRM1 到 VRM0 坐标转换，并适配自然垂臂。 |
| 重心偏向一侧 | Standing；转换并投影到合法关节范围，适配落地高度。 |
| 右手挥手、抬右臂靠近脸 | 从 Double Peace 提取右臂，转换并调整；手指形状单独控制。 |
| 转头看左前方、低头看近处 | 在已有姿态基础上本地制作头颈调整。 |
| 头枕双手 | 针对示例骨架本地制作双臂和后脑支撑；站姿预览基础沿用已有姿态。 |

原始 URL、源文件校验值、改编说明和当前校验值见 [assets/catalog.json](assets/catalog.json)。第三方动作并非本项目原创。上游仓库也包含另有使用条款的素材；公开版没有复制整套素材库。

### ketle-man / comfyui-vrm-pose-editor

- 项目：[ketle-man/comfyui-vrm-pose-editor](https://github.com/ketle-man/comfyui-vrm-pose-editor)
- 检查版本：[79fcf13438626e4f882f880c095d05e68eb26592](https://github.com/ketle-man/comfyui-vrm-pose-editor/tree/79fcf13438626e4f882f880c095d05e68eb26592)
- 该版本 LICENSE 署名为 Copyright (c) 2025 statsu；[MIT 许可原文](licenses/comfyui-vrm-pose-editor-MIT.txt) 按原文保留。

主要参考 `js/pose_editor_core.js` 的独立机位配置快照、命名切换，以及 `js/light_editor.js` 的数值输入与滑杆同步交互。对应能力按本工作台的指令、持久化和限制重新实现。其核心编辑器、供应商库和后端未嵌入本项目。多灯、时间轴与镜像部分曾作源码阅读，不代表这些功能已移植或已在本工作台实现。

## 示例角色

`AvatarSample_A` 由 **VRoid Project** 制作，通过上述 vrm-studio 固定版本取得。模型文件保持原样。VRM 内嵌元数据指向 VRoid Hub 的独立许可，允许所有人使用、修改和再分发，署名非强制；具体使用仍以完整条款为准。该模型不因放入本仓库而改为 MIT。

- [来源、原始许可链接和 SHA-256](assets/model-source-a.json)
- [完整内嵌许可元数据](licenses/AvatarSample_A-embedded-license.json)
- [2026-09-28 核对的许可页文本](licenses/AvatarSample_A-license-page.txt)

动作缩略图和示例画面使用该角色渲染，角色素材的许可仍适用。

## 探索过、但未随公开版分发的内容

- **ぽいなぁ / Free VRM Posing Desktop posecollection vol.1**：早期坐姿、托腮、叉腰、抱臂与伸手方向曾据此作本地适配。许可禁止数据再分发，原数据及可提取的改编动作均未纳入公开版。相关软件：[VRM Posing Desktop](https://store.steampowered.com/app/1895630/VRM_Posing_Desktop/)。
- **pixiv Inc. / VRoid Project VRMA MotionPack**：曾用官方动画组件试验 `VRMA_03_Peace_sign.vrma` 取帧；该动作数据不随公开版分发。公开版保留运行库支持，并不授予任何未附带动画的使用权。
- **ComfyUI / HandRefiner 方向**：手部修图资料可交给用户自己安装的 ComfyUI。当前模板采用深度约束的局部重绘，没有集成 HandRefiner 的图像重建预处理，也不附带 ComfyUI、模型权重或 MANO 数据。它们不是启动工作台的依赖。

本项目新增代码按根目录 [MIT LICENSE](LICENSE) 提供；依赖、模型与动作遵守各自许可。再次分发时，请保留本文件、第三方说明与相应许可原文。
