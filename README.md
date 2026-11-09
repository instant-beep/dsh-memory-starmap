# dsh-memory-starmap

把 DSH（DeepSeek Harness）的记忆系统投影成一张**可旋转的三维星图**——项目档案是星、会话是轨、源码是尘、技能是光晕。

零依赖：不引入 three.js / d3 / 任何图库，全部用手写 Canvas 2D 完成三维投影、力导向布图与辉光渲染。

```
npm/pnpm 依赖：0
运行时依赖：DSH Web 客户端提供的 React
支持的节点规模：实测 370 星 / 477 边 稳定 60fps
```

## 它长什么样

- **深空背景**：多层星云、3D 星尘（转相机有视差）、星系核 + 旋转吸积臂、方位罗盘
- **星点分色**：项目档案=青、会话=紫、源码=金、技能=品红、运行时记忆=暖白；尺寸按连接权重，重量级星带十字光芒与冕环
- **关系可读**：`semantic`（内容相似）弧线明显，`skill`（技能↔档案）次之，`session`/`file`（出处）几乎笔直——看形状就知道是什么关系
- **景深**：越远的星越淡越小、线越细，且近暖远冷（大气透视）
- **加色合成**：所有发光元素用 `lighter` 叠加，是真正的“光积起来”而不是半透明糊片

## 四种布局

| 布局 | 规则 | 适合看什么 |
| --- | --- | --- |
| 引力场 `force` | 3D 力导向，未归档对话被约束在外圈 | 聚类与核心主题 |
| 星系 `orbital` | 按创建时间沿双螺旋臂外扩，Y 轴有盘厚 | 记忆随时间的生长形态 |
| 星团 `cluster` | 每种类型占一个 3D 方向扇区 | 类型分布是否失衡 |
| 地层 `layers` | 沿 Y 轴硬分层：空间 +720 / 技能 +470 / 档案 +160 / 运行时 −70 / 会话 −320 / 源码 −490 | 记忆的层级结构 |

## 功能

- **时间轴回放**：15 秒走完整条时间跨度，记忆按创建时间逐颗点亮，新星有出生闪光。物理始终按全量计算，所以回放是“在既有星座上点亮”，不会重排抖动。
- **最短关联路径**：选中一颗星，`Shift` + 点击另一颗，BFS 找出两者之间的最短关联链，金色高亮并显示跳数。
- **活会话层**：只有写出过档案的对话才存在于记忆里；没归档的对话由客户端补齐，画成外圈空心环，星卡可直接「打开对话」跳回那段会话。
- **搜索定位** / **最新记忆** / 图层开关 / 时间范围 / 双指捏合 / `prefers-reduced-motion` 降级。

## 数据来源

全部只读，来自本机，不联网：

| 层 | 来源 |
| --- | --- |
| 项目档案 | `~/.mnemon/documents/index.json` + `active/*.md` 的 frontmatter |
| 会话 | 档案里的 `sessionIds`，以及未归档会话（客户端 workspace store） |
| 源码 | 档案的 `sourcePaths` |
| 运行时记忆 | `~/.mnemon/runtime/USER.md`、`MEMORY.md`（按 `§` 分条，解析 `[importance=…]`） |
| 技能 | `~/.dsh/skills`、`~/.agents/skills`、各会话 cwd 下的 `.dsh/skills`、内置 preset skills |
| 记忆空间 / 洞见 | mnemon provider（未就绪时画虚线圆标注“待点亮”，不伪造数据） |

关系边：`session`、`file`、`body`、`runtime`、`skill`、`semantic`（TF-IDF + 中文 bigram 余弦，每篇取前 3、阈值 0.16、无向去重）。

## 架构

```
index.js      Host 半：注册只读路由 GET /api/dsh-memory-starmap/graph
              · 聚合五层数据 → { nodes, edges, stats, roots, warnings }
              · 信任围栏：loopback + host header + 无 x-forwarded-for
                + 非 cross-site + 已配对设备
client.js     Client 半：sidebar 图标 + main 面板
              · class Camera   轨道相机 + 透视投影（yaw/pitch/dist，fov 900）
              · class StarMap  3D 力导向、LOD、加色渲染、命中测试、BFS
cordis.patch.yml   bundle patch（install_bundle 用）
locale/{zh,en}.json
icon.svg
test/         两套无头冒烟测试（见下）
```

数据结构约定：节点 `{ id, kind, label, sub, ts, created, group, weight, meta }`，边 `{ s, t, kind, w }`；id 前缀 `doc:` `session:` `file:` `runtime:` `skill:` `space:`。

## 安装

这是一个 **profile 本地 bundle**（所以包名带 `@local` scope）。两种装法：

### 1. 本地链接（推荐，镜像/离线可用）

```powershell
# 1) 把仓库放到任意位置，例如 D:\dsh-plugins\dsh-memory-starmap
# 2) 在 profile 里建 junction
mklink /J "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\@local\dsh-memory-starmap" "D:\dsh-plugins\dsh-memory-starmap"
```

```yaml
# 3) cordis.patch.yml 末尾追加
- insert:
    - id: memory-starmap
      name: "@local/dsh-memory-starmap"
```

```json
// 4) profile 的 package.json（防止后续 pnpm install 清掉链接）
"dependencies": { "@local/dsh-memory-starmap": "link:D:\\dsh-plugins\\dsh-memory-starmap" }
```

客户端 bundle 会 HMR 热加载；**Host 模块不会热重载**，改动 `index.js` 需要重启一次 DSH。

### 2. 发布到 npm 后安装

把 `package.json` 的 `name` 改成 `dsh-memory-starmap`（同时同步 `cordis.patch.yml` 与 profile patch 里的名字），去掉 `private: true`，即可 `dsh plugin install`。

## 开发与测试

```bash
# Host 半：不开 Cordis，直接调 handler，校验聚合结果
node test/smoke-host.mjs

# Client 半：mini React + mock Canvas 走真实 __ModuleLoader__ 契约
# 需要一份 fixture（自己抓一次路由输出，含个人数据，勿提交）
curl -s http://127.0.0.1:<port>/api/dsh-memory-starmap/graph -o test/fixture-graph.json
node test/smoke-client.mjs
```

`smoke-client.mjs` 会真的把面板渲染一遍、创建引擎、跑数百帧，并断言：无 NaN 坐标、三维纵深存在、pick 命中、三种过滤、四种布局的收敛结果、BFS 路径、回放过滤生效。

## 设计参考

三维层：`vasturiano/3d-force-graph`(6.5k)、`vasturiano/d3-force-3d`、`vasturiano/three-forcegraph`、`anvaka/ngraph.forcelayout3d`，并借鉴 `three.js` 的透视/雾/加色 sprite 视觉范式（但不引入依赖）。

二维与记忆模型：`mem0ai/mem0`(68.7k)、`getzep/graphiti`(32.7k)、`logseq/logseq`(45.5k) 与 Obsidian graph（局部图聚焦）、`jacomyal/sigma.js`(12.2k)（LOD）、`antvis/G6`(12.4k)、`cytoscape/cytoscape.js`(11.3k)、`anvaka/ngraph`(1.5k)、`Egonex-AI/Understand-Anything`(91.6k)（可解释节点卡）。

## 隐私

插件只读本机 `~/.mnemon` 与技能目录，不上传任何数据；路由仅对本机回环 + 已配对设备开放。仓库里**不包含**任何个人记忆内容（`test/fixture-graph.json` 已在 `.gitignore` 中）。

## License

MIT © 2026 instant-beep
