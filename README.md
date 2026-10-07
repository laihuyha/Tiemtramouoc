# Tiệm Trà Mơ Ước — Reverse & Tooling

Reverse-engineering và công cụ dev cho game client-side **Tiệm Trà Mơ Ước** (`tiemtramouoc.tensorship.tech`).

| Thư mục / file | Nội dung |
|---|---|
| [`tool-panel/`](tool-panel/README.md) | **RE Tool Panel** — panel inject thẳng vào game đang chạy (không reload), nhiều tab + cửa sổ riêng, bảng offset `bindings.json` + máy quét `scan.mjs` để cập nhật khi game update |
| [`GAME-MECHANICS.md`](GAME-MECHANICS.md) | Tài liệu cơ chế game (kinh tế, chấm sao, traffic, sự kiện, anti-cheat, chu kỳ 5★…) kèm số dòng code |
| [`save-editor.html`](save-editor.html) | Save editor độc lập (dán save `tsShop2` → sửa → xuất lệnh ghi lại) |

## Chạy 1 phát (Windows)

Double-click **`run.cmd`** — script tự kiểm tra và cài thứ còn thiếu, mở game trong Edge có CDP, build và inject panel. Phím `Insert` ẩn/hiện panel.

```bat
run.cmd            :: cài thiếu -> mở game -> build -> inject
run.cmd -Test      :: + chạy test trên game thật (save được snapshot & khôi phục y nguyên)
run.cmd -Update    :: game vừa update: tải source mới, quét lại offset, build, inject, test
run.cmd -Eject     :: gỡ panel, khôi phục hàm gốc của game
run.cmd -Check     :: chỉ kiểm tra prerequisites, không cài gì
```

## Prerequisites

| Thành phần | Dùng để | Nếu thiếu | `run.cmd` tự xử lý |
|---|---|---|---|
| **Node.js ≥ 22** | chạy `scan/build/inject/test.mjs` (cần `fetch` + `WebSocket` có sẵn trong Node) | `node` không chạy được; Node cũ báo `WebSocket is not defined` | cài `OpenJS.NodeJS.LTS` qua winget |
| **Edge hoặc Chrome** | chạy game và mở cổng debug CDP 9222 để inject | không inject được (`không kết nối được CDP`) | dùng Edge/Chrome có sẵn, không có thì cài `Microsoft.Edge` |
| **winget** | chỉ để tự cài 2 thứ trên | phải cài tay (script in link) | có sẵn trên Windows 10 1809+ / 11 (App Installer) |
| Internet | mở game, tải source game cho scanner | không mở được game | — |

Không có Node vẫn dùng được: lấy `tool-panel.js` (bản build sẵn), mở game, F12 → Console, dán vào.

Ghi chú: script dùng profile trình duyệt riêng `edge-debug-profile/`, không đụng Edge bạn đang dùng. Nếu cổng 9222 đã bị một trình duyệt khác chiếm mà không có tab game, script mở thêm tab game trên đó.

## Chạy tay (mọi OS)

```bash
msedge --remote-debugging-port=9222 --user-data-dir=./edge-debug-profile https://tiemtramouoc.tensorship.tech/
cd tool-panel
node scan.mjs --fetch   # tải source game để scanner đối chiếu
node build.mjs
node inject.mjs
node test.mjs
```

## Ghi chú

- Repo **không** chứa source của game (`js/` bị ignore) — `scan.mjs --fetch` tải lại khi cần.
- Patch runtime chỉ tồn tại trong phiên; các thay đổi state được lưu vào save của game.
