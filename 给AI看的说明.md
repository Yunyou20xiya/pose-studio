# 本地 AI 助手如何操作工作台

这份文件解释本工作台的本地接口。使用范围由用户当前要求决定。不要把对其他项目、联网服务、第三方消息或账户的操作视为已获授权。

## 连接

让用户先双击 Start-Workbench.cmd，并保持浏览器页面打开。需要活跃的浏览器编辑会话来接收命令。窗口里会显示本机地址，local-data/portable-connection.json 记录当前端口。

在这个文件夹中使用 PowerShell：

```powershell
.\runtime\node.exe scripts\pose-command.mjs --scene
.\runtime\node.exe scripts\pose-command.mjs --catalog
.\runtime\node.exe scripts\pose-command.mjs --combinations
.\runtime\node.exe scripts\pose-command.mjs --hand-interactions
```

也可以调用 `AI-Scene.cmd --scene`。返回场景状态不代表修改已完成。

## 布置与修改

先读取当前场景，保留用户已经摆好的动作和镜头；在修改前按需要将完整状态另存为本地备份。场景操作由 src/scene/engine.js 解释。人物关节指令由 src/pose/engine.js 和 assets/profiles/primary.json 定义，不要猜关节名字或越过限制。

将合法布置方案保存为 UTF-8 JSON，使用：

```powershell
.\runtime\node.exe scripts\pose-command.mjs --arrange plan.json
```

场景编排格式为 `{"label":"布置名称","steps":[...]}`。每个场景步骤包含 `kind:"scene"`、`action` 和必要参数。可先使用内置组合验证连接：

```powershell
.\runtime\node.exe scripts\pose-command.mjs --apply-combination builtin-standing-chat
```

这会向当前场景添加人物和椅子，必须在用户要求该布置时执行。其他指令可通过 `--file command.json` 提交。正常成功必须收到 `status:"applied"`；queued 或 running 只是等待状态，不是已完成。

## 验证和导出

读取回传现场，检查人物数量、左右手、接触、物品位置、相机和光照。实际打开最终取景确认遮挡与落地关系。用户满意后保存镜头，再使用页面上的“导出 AI 参考包”。

本程序不会生成插画。要把参考图交给外部图片模型，需要按用户自己的选择和授权使用该模型。

## 文件边界

程序代码在 src 和 server，编辑状态在 local-data，导出在“导出”。runtime/node.exe 是经官方 SHA-256 核对的 Node.js Windows x64 运行时。

不要把 local-data/runtime*/connection.json 的连接令牌、用户新建的项目、私人参考图或整个工作记录上传到第三方。软件更新时保留用户的 local-data 和导出目录；不要自动覆盖其现场。
