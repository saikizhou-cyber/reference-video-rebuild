# Contributing · 参与贡献

Thanks for helping. This is a small project, so the bar is simple: it should run as documented, and a new effect should look good in the gallery. 欢迎提 Issue 和 PR；门槛很简单：按文档能跑通，新特效在画廊里要好看。

## Good first contributions

- **A "watch out"** you hit while using an effect (a default that hides content, which frame is the hit). Add it as `notes` in the effect's `meta`; it shows up in `library/catalog/`. Please check it by rendering, not by reading the code.
- **A command that does not run as documented** (a flag, a path, a Windows quirk). Fix the doc or the script and say what you ran.
- **A new effect** (see below).
- **A showcase:** open an Issue with what you made and which effects you used.

## Add an effect

One file per effect in `library/effects/<category>/<id>.tsx`, exporting the effect, its props type and a `LibraryEntry` (`meta` + `Demo`); register it in the category's group file. The full rules are in [`library/README.md`](library/README.md#add-an-effect). In short:

1. Everything comes from `useCurrentFrame()` and props: no `Math.random`, `Date`, timers or CSS animations (use `random(seed)` from Remotion).
2. Sizes in 720p units via `useUnit()`, so it scales to any composition.
3. Copy code only from MIT / Apache-2.0 / BSD / ISC / zlib / CC0 sources, check the raw `LICENSE` file, keep the copyright and add a `// Ported from ...` header. Anything else: learn from it and write your own. Never copy from a source without a licence file.
4. Run the checks from `library/`: `npm run typecheck` and `npm run lint`.
5. Render the demo and look at it: `node gallery/previews.mjs --only <id> --check` (the contact sheet and the same-frame-twice check), `node gallery/demos.mjs --only <id>` (a small mp4). An effect that is not pretty does not go in.
6. Describe in `meta` what the viewer sees (`looks`), when to use it (`use`) and, if needed, the trap (`notes`). `npm run catalog` regenerates the index and `catalog/`.

## Pull requests

- Keep a PR to one thing. Say what you ran to check it.
- Original content only: no frames, music, characters, logos or lettering from existing works (see rule 2 in [`SKILL.md`](SKILL.md)).
- Do not add or upgrade dependencies without saying why.
- By contributing you agree your contribution is licensed under the MIT licence of this repository (ported code keeps its own notice).

## 中文说明

- **新增特效**：`library/effects/<类别>/<id>.tsx` 一个文件，导出特效、props 类型和 `LibraryEntry`（`meta` + `Demo`），并登记到该类别的分组文件。规则见 [`library/README.md`](library/README.md)：一切从 `useCurrentFrame()` 和 props 算出来，不用 `Math.random` / `Date` / 定时器 / CSS 动画；按 720p 单位写；只从 MIT / Apache-2.0 / BSD / ISC / zlib / CC0 的来源复制代码并保留版权头；在 `library/` 里跑 `npm run typecheck`、`npm run lint`，并渲染演示亲眼看过再提交。
- **"注意"事项**：写进特效 `meta` 的 `notes`，要渲染实测，不要只读代码推断。
- **只做原创**：不带任何已有作品的画面、音乐、角色、Logo 或字体。
