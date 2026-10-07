# RE Tool Panel — Tiệm Trà Mơ Ước

Panel dev/reverse inject thẳng vào game đang chạy (không reload). Bấm nút nào là gọi đúng cơ chế của game.

## Dùng hằng ngày

Nhanh nhất: `run.cmd` ở thư mục gốc (tự cài prerequisites + mở game + build + inject; xem README gốc). Từng bước:

```bash
# Edge phải mở với --remote-debugging-port=9222 và đang ở tab game
node build.mjs            # gộp src/ + bindings.json → dist/tool-panel.js
node inject.mjs           # bơm vào tab game (chạy lại = hot-reload)
node inject.mjs --eject   # gỡ panel, khôi phục mọi hàm gốc
node test.mjs             # kiểm tra toàn bộ action trên game thật (save được snapshot & khôi phục y nguyên)
```

Phím `Insert` ẩn/hiện mọi cửa sổ panel.

## Khi game update — chỉ cập nhật offset

```bash
node scan.mjs --fetch --write   # tải js mới, dò lại tên hàm/biến/hằng số, tự ghi bindings.json
node build.mjs && node inject.mjs && node test.mjs
```

Kết quả `scan.mjs`:

| Trạng thái | Nghĩa | Việc cần làm |
|---|---|---|
| ✓ OK | khớp | — |
| → RELOCATED | game đổi tên, đã dò ra tên mới qua anchor/pattern | `--write` tự sửa |
| Δ CHANGED | hằng số / danh sách đổi giá trị | `--write` tự sửa |
| ~ STALE / ! WARN | tên còn nhưng anchor/pattern cũ | sửa `anchor`/`pattern` trong `bindings.json` |
| ⚑ SIGCHANGE | hàm đổi tham số | xem lời gọi trong `src/20-actions.js` |
| ✗ MISSING / ? AMBIGUOUS | không tự dò được | tìm tay trong `js/`, sửa `bindings.json` |

Thêm `--live` để kiểm tra từng binding trên trang đang chạy. Exit code ≠ 0 nghĩa là còn việc tay.

## Kiến trúc

```
bindings.json         bảng offset: mọi tên hàm / biến / field / ID của game + chữ ký để dò lại
src/00-core.js        namespace, patch khôi phục được, scheduler rAF ↔ interval, hot-reload
src/05-adapter.js     lớp DUY NHẤT biết tên game → API theo key: G.call('save'), G.get('money')…
src/10-ui.js          DOM builder, binding live (diff), window manager kéo thả
src/20-actions.js     logic cơ chế — chỉ gọi qua G, không chứa tên game
src/30-main-panel.js  panel chính: Chung · Menu game · Ca & Sự kiện · Patch · Save · Cửa sổ
src/40..42-win-*.js   cửa sổ riêng: Vườn, Thú cưng, Khởi nghiệp & Chi nhánh, Thuế & Bank,
                      Nâng cấp & Trang bị, Nhân sự, State Inspector, Bindings
scan.mjs · build.mjs · inject.mjs · test.mjs
```

Thêm tính năng: thêm binding vào `bindings.json` → action trong `20-actions.js` (dùng `G.*`) → nút trong panel/cửa sổ (`RT.gbtn` tự khoá nút nếu binding hỏng).

## Lưu ý cơ chế game

- **Anti-cheat** (`cheatHit`): ① trước ngày 30 mà két > 100tr, ② lúc tải trang mà két > 400k + ngày × 500tr → bị tịch thu, chỉ còn 100–900k. Panel bật sẵn "Chặn anti-cheat" (chỉ trong phiên). Muốn an toàn cả khi reload: thuê **Bảo vệ** (nút 👮 trong tab Chung) — game bỏ qua anti-cheat khi có Bảo vệ.
- **Chu kỳ 5★**: rating ≥ 4.85 → ly kế tiếp game reset về 0★ và thưởng `star5Count` + hạn mức Bank. Dùng "Cán mốc 5★" để nhận thưởng, hoặc bật "Khoá rating" để giữ 5★.
- **Lỗi game đã vá** (bật sẵn, tắt được ở tab Patch): tưới vườn rồi đổi tab trong ~0.75s thì vườn ghi đè tab khác.
- Patch runtime chỉ sống trong phiên; thay đổi state thì được lưu vào save của game.
