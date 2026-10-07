# Tiệm Trà Mơ Ước — Tài liệu cơ chế game (reverse)

> Nguồn: `js/game.js` (v12.47.358, ~22.9k dòng, không obfuscate) + các module mini-game.
> Mọi tham chiếu `game.js:N` là số dòng.

## 0. Tổng quan kỹ thuật
- Game quản lý/idle tiệm trà, **100% client-side**, không backend, không chữ ký. `_v`/`_t` trên URL chỉ là cache-bust.
- Save người chơi: `localStorage['tsShop2']` = state `S`. Config chủ game: `localStorage['tsOwner']` = `CFG` (PIN `2468`).
- State mặc định: `fresh()` tại `game.js:3463`. Biến runtime: `R` (`{mode,tab,plan,slots,online,running,paused,t,...}`).
- Vòng lặp: `tick()` `game.js:19499`, chạy mỗi **100ms** qua `timer=setInterval(tick,100)`.

## 1. Thời gian & cấp độ
- 1 ngày game = **4 phút thật** (`CFG.dayMin=4`), khung 11:00–22:00. 22:00 đóng cửa (không nhận khách mới, làm nốt khách trong quán).
- `startDay()` `game.js:19989` → `endDay()`/`finishEndDay()` `game.js:20037`.
- Cấp độ theo ngày (`CFG.levels`): ngày 1–5 cơ bản → **ngày 6** (`l2`) thêm đường/đá → **ngày 30** (`l3`) ly 2 topping → **ngày 60** (`l4`) đơn 2–5 ly.

## 2. Tạm dừng (auto-pause)
- `visibilitychange` → `if(document.hidden) pauseGame()` `game.js:19895`. Chỉ dựa trên visibility (chuyển app/tab/minimize), KHÔNG nhận diện Word/Excel cụ thể. KHÔNG tự resume.
- `pauseGame()` `game.js:19818`: guard `!R.running||R.paused`, `R.paused=true`, `clearInterval(timer)` (đóng băng `R.t`), modal "Tạm dừng ca bán".
- `resumeGame()` `game.js:19893`: `R.paused=false`, restart timer. Chỉ khi bấm "▶ Chơi tiếp".
- `beforeunload`+`pagehide` → `handleAppUnload` (save khi thoát) `game.js:19891`.

## 3. Pha chế & giao ly (gameplay loop)
Lấy ly (M/L) → rót trà (giữ hũ, thả đúng vạch xanh; giữ lâu = tràn) → topping (tới 4, chỉ 1 foam) + hương (siro) → đường (bấm 1/2/3/4 lần = 30/50/70/100%) + đá (xúc 0/1/2 = không/ít/thường) → dán nắp giao. Thứ tự không quan trọng, dán nắp là chốt.
- Khớp đơn: `matches(cup, order)` trong `serve(i)` `game.js:18833`. Giao sai → ly bỏ, mất nguyên liệu.
- Giá ly: `price(order)` (cộng trà + size L + hương + topping). Cap giá xem §6.

## 4. Chấm sao từng ly — `stars(c,online)` `game.js:18354`
Gọi `w = 1 - c.pat/c.max` (tỉ lệ kiên nhẫn đã dùng). Base **s=5**, trừ dần:
- `w>0.45` → −1 (chờ lâu)
- `w>0.78` (hoặc `0.88` nếu có máy lạnh `S.upg.ac`) → −1
- `w>0.92` → −1
- `fillPen` (rót sai mức) → −1
- `pricey` (ly đắt, `orderPricey`) → −1
- `wrong` (sai món): giao luôn → sao 1–2; nếu pha lại rồi giao → 35% 5 sao, còn lại 4 sao
- Khách khó (`brat='kho'`): dễ rớt sao thêm
- Mood ngày: `kho` (khó ở) chặn trần 3–4 sao kể cả phục vụ tốt; `vui` nâng sao
- Ly **rẻ** (`cheap`, không pricey & idx<0.9) → +1
- Nâng cấp Topping (`S.upgLv.top`) → mỗi level +0.5% cơ hội +1 sao
- Khách đặc biệt/bạn bè/free/recipe guest → cố định 5 sao
- `addReview(s,why,...)` đẩy vào `S.reviews`.

**Rating quán** = `rating()` `game.js:3998` = trung bình **40 review gần nhất** (mặc định 4). **< 4 sao → quán vắng hẳn** (mất ~40% khách).

## 5. Tiền tip — trong `serve()` `game.js:~18932`
`tip = round((c.pat/c.max)*5)*1000 × hệ số` (càng nhanh càng nhiều, tối đa ~5.000đ/ly base). Hệ số nhân:
- máy dán nắp `S.upg.sealer` (+bonus), ngày lễ ×2, nhân số ly
- khách hào phóng `brat='haophong'` ×2.5; bạn bè ×2; recipe guest ×3
- staffRacer (đơn online) ×1.6 +5k/ly; combo tới +50%; địa điểm (halong ×1.3, cantho ×1.25, hanoi ×1.15...)

## 6. Kinh tế — `DEFAULT_CONFIG` `game.js:3256`
| Tham số | Giá trị | Ý nghĩa |
|---|---|---|
| `startMoney` | 400.000đ | vốn đầu |
| `rent` | 40.000đ/ngày | mặt bằng |
| `utilBase`+`utilPerUpg` | 20.000 + 8.000/trang bị | điện nước |
| `commission` | 20% | phí app giao hàng |
| `priceCap` | 120.000đ/ly | vượt → 60% khách bỏ |
| `teaCap` / `teaCapMatcha` | 40.000 / 50.000 | trà đắt |
| `itemCap` | 50.000đ/món | vượt → quán vắng 80% |
| `sizeCap` / `sizeWarn` | 50.000 / 20.000 | phụ thu size L |
| `bottle` / `bottleN` / `bottleLife` | 200k / 45 ly / 7 ngày | chai hương |
| `tablet` | 7.000.000đ | mỗi tablet = 1 app online |
Nguyên liệu: `CFG.cost[k]`/`CFG.life[k]` từ bảng `ITEMS` (hạn dùng ngày, hết hạn = đổ bỏ mất tiền).

## 7. Lưu lượng khách — `traffic()` `game.js:5096`
`rf = ((.55 + (R-1)/4*.9) * clamp(.6,1,.6+(R-3.5)*.4) + star5Boost) * (ngày<10 ? .8+.02*day : 1)` rồi nhân chuỗi buff:
- `star5Count` (+5%/lần, trần +35%), staffGz (×2.5 nếu không dỗi, else ×1.5), `upgLv.tra` (+0.5%/lv), friendBuff (+15%), KPI staff, tax boost
- Tăng theo ngày (`dayBoost`): +2.5%/ngày (1–10), +2%/ngày (11–30), +1.6%/ngày (31–90, trần)
- partyContract hôm nay +35%, staffMkt +45%, Ads (`S.mxh.activeAds`)
- Spawn khách: `R.spawnT` tỉ lệ nghịch `traffic()` (`tick` `game.js:~19543`); rush hour `rushMul()`.

## 8. Sự kiện & thời tiết — `EVS` `game.js:4002`
Mỗi event có `mul` (khách quầy) và `onlMul` (đơn online):
- hot ×1.35/0.95 · rain ×0.65/**1.80** · cold ×1.20 · storm ×0.50/**2.20** · sunny ×1.40 · fog ×1.20 · humid ×1.15/1.10 · weekend ×1.30/1.25 · students ×1.15 · reviewer (3 review tốt/xấu) · trend ×1.25/1.20 · sale (nhập −30%) · holiday ×2.0/1.60 (tip ×2)
- Mưa/bão → khách quầy giảm nhưng **đơn online bùng nổ**.

## 9. Thu nhập ngẫu nhiên — `GIFTS` `game.js:4020`
Lì xì, trả ví, giải quán đẹp, tài trợ nhãn hàng (cần ≥20 review & rating≥4.5), ve chai, công an trả tiền khách bùng, vé số, hoàn tiền NCC, bình chọn (≥50 review & rating≥4.3), cọc tiệc (ngày≥15). Mỗi loại có `min`/`max` và điều kiện `need()`.

## 10. Hợp đồng tiệc — `rollPartyContract(d)` `game.js:4049`
- Chỉ từ ngày ≥3. Cơ hội 45% (75% nếu weekend/holiday). 5 loại: sinh nhật/công ty/họp lớp/hội thao/lễ hội.
- Số ly: ≤10→8-12, ≤30→14-20, ≤60→22-30, >60→30-45. `avgCupPrice=28.000đ`.
- `deposit=35%`, `payout=65%`, `bonus=25%` tổng giá trị (làm tròn 10k).

## 11. Khách "khó tính" (brat) — xử lý trong `serve()`
- `mac` (mặc cả): giảm 15–25% (bảo vệ chặn)
- `thieu` (trả thiếu): giảm 12–25% (bảo vệ chặn)
- `bung` (ôm ly bỏ chạy): mất tiền, công an có thể trả lại
- `haophong`: tip ×2.5 · `doi`: đổi ý khi pat<72% (`bratChange`) · `kho`: khó chấm sao
- **Tiền giả** (`isFake`): tỉ lệ 0.3%/1%/3.5% theo két (50tr/1 tỷ). Bảo vệ `staffGuard`→0%; Đà Nẵng/Hoàng Sa→0%; tax active ×0.5, overdue ×1.3. Nút "Báo công an" `reportFakeMoneyPolice`.
- Bonus x2 bill: `staff` level ×0.5%/lv + tax ×2 rate.

## 12. Kiên nhẫn & bỏ về — `tick()` `game.js:19499`
- `patSpeed = dt` (×1.25 nếu tax overdue; ×0.85 nếu chó happiness≥50; các buff khác). `c.pat -= patSpeed`; `pat≤0` → khách bỏ về (mất khách, ảnh hưởng review/rating).
- Đơn online spawn riêng (`spawnOnline`, `R.onT`), chịu `onlMul` thời tiết + staffRacer + ads + địa điểm.

## 13. Tổng kết cuối ngày — `finishEndDay()` `game.js:20089`
- Trừ chi phí cố định `fixed()`: rent + util + wage nhân viên + lãi vay + phí app + thuế.
- Đếm ngược buff (tiktoker viral, crush buff), garden `advanceDay`, pet giảm chỉ số (mèo giảm vui/no nhanh, chó giảm sạch/năng lượng nhanh; `staffButler` auto chăm).
- Vỡ nợ (`broke`) nếu hết tiền. Lưu record ngày vào `S.history`.

## 14. Tài chính & thuế
- **Tà Tưa Bank**: gửi `openBankDepositDlg` `game.js:4695` / rút `openBankWithdrawDlg` `game.js:4865`. `bankMax=1tr` (tăng theo 5 sao: `increaseBankCapOn5Star`), lãi 25%/năm(360).
- **Vay**: NH khi két<`loanLow 200k`; vay nóng `hotMax 3tr` lãi 45%. `loanCard` `game.js:4196`.
- **Thuế** (tab 'thue' `game.js:22070`): miễn nếu doanh thu năm < `taxThreshold 500tr`; vượt thì VAT 3% + TNCN 1.5%. Đóng thuế → buff (giảm tiền giả, x2 bill, traffic).

## 15. Sự kiện trộm két
- Nếu `S.money > thiefMoney (100tr)` **trước ngày `thiefDay 30`** → bị trộm, chừa lại `thiefLeft 500k`. Phòng tránh: gửi Tà Tưa Bank.

## 16. Nâng cấp & mở rộng
- Tab 'nangcap' `game.js:11641`: tra/huong/top/equip/staff/onl (`S.upgLv`). Trang bị: máy dán nắp (`sealer`), máy lạnh (`ac`, nới ngưỡng chờ), v.v.
- Số slot khách: 3 → 6 (`upg.slot4`) → 10 (`upg.floor2`) — `getMaxSlots()` `game.js:3467`.
- **Chuỗi chi nhánh**: `openChiNhanhView` `game.js:21869`, thuê quản lý `hireLeaderForBranch` `game.js:1164`. Mỗi chi nhánh có `onlBoost`.
- **Địa điểm khởi nghiệp** (`S.startupLocation`): hcm/hanoi/hue/danang/sapa/halong/cantho/buonmethuot/hoangsa... mỗi nơi buff giá/tip/online/tiền giả khác nhau.

## 17. Nhân sự (lương/ngày)
phụ quầy `wage1 165k` · pha chế `wage2/3 200k` · online `wageOn 250k` · Gen Z/marketing "Me két tinh" `wageGz 275k`/`wageMkt 200k` · đi chợ `wageBuyer 180k` · phục vụ đêm `wageSv 300k` · bảo vệ `wageGuard 300k` · racer `wageRacer 1tr`. Entry: `hireOrCallStaff()` `game.js:9069`.

## 18. Mạng xã hội & bạn bè
- MXH "Trà Sữa Feed": `openMxhView` `game.js:21879` — chạy Ads kéo khách (`S.mxh.activeAds`).
- `banbe.js`: hệ thống bạn bè, tương tác xã hội, buff `friendBuff`.

## 19. Mini-games (module riêng)
| File | Nội dung | Buff chính |
|---|---|---|
| `garden.js` | Vườn 16 ô trồng thảo mộc/trái cây | organic buff +20–30% giá trà |
| `weather.js` | Thời tiết/mùa động + sự kiện reviewer/TikToker | viral days |
| `pet_run.js` | Thú cưng chạy bộ (3 độ khó) | — |
| `codam.js` | Match-3 "Trà Sữa Crush" | `crushBuffRate` +% giá ly |
| `oanquan.js` | Ô ăn quan "Đấu trí trân châu" | — |
| `collection.js` | Sưu tập 100 nguyên liệu + gacha công thức | mốc nhận túi 3 nguyên liệu |
| Pet/Cáp Bi (trong game.js) | thú cưng quầy, Cáp Bi | tip/traffic/x2–x5 giá ly (`cupCritRate`) |

## 20. Save/backup & dev hooks
- Sao lưu/khôi phục mã: `backupDlg` `game.js:21653` / `restoreDlg` `game.js:21671`.
- Hook `window`: `getMoney()`, `setMoney(m)`, `recordGamble(won,lost)` `game.js:3482`.
- Bảng chủ game: PIN `CFG.ownerPin='2468'` (chỉnh toàn bộ `CFG`).

## 21. Anti-cheat — `cheatHit()` `game.js:4235`
- Hình phạt: giữ lại ngẫu nhiên **100k–900k**, tịch thu phần còn lại (giảm theo `upgLv.equip` 1%/cấp, tối đa 90%); đặt `S.badNow={all:1,...}` → modal "Trong két chỉ còn …".
- Luật ① `badCheck()` (sau mỗi render màn chuẩn bị): `S.day < CFG.thiefDay (30)` **và** `S.money > CFG.thiefMoney (100tr)`.
- Luật ② `sanitize()` (lúc tải trang, `game.js:~3870`): `S.money > CFG.startMoney + S.day × 500tr`, tiền NaN, hoặc lịch sử doanh thu không khớp → cheatHit + tính lại `totalProfit/totalRev`.
- Miễn trừ: có **Bảo vệ** (`isStaffActive('staffGuard')`) → cheatHit return ngay. Đây là cách duy nhất lưu vào save nên bảo vệ được cả lúc tải trang.
- Ngoài ra có sự cố "thật" theo `S.badPlan` (0–2 lần/90 ngày, mất < 1tr) — không phải anti-cheat.
- Két ≥ 1 tỷ: game hiện cảnh báo + tỉ lệ tiền giả 3.5%/ly.

## 22. Chu kỳ 5★ — `checkReset5StarRating()` `game.js:4634`
- Gọi sau mỗi review. Khi `rating() ≥ 4.85`: `star5Count++`, tăng hạn mức Tà Tưa Bank (`increaseBankCapOn5Star`), rồi chèn 4 review 0★ lên đầu → rating tụt (vd 5.0 → 4.5). Tức là 5★ là mốc "cày lại", không phải trạng thái giữ được.

## 23. Nâng cấp cấp độ — `handleUpgLv(cat)` `game.js:12634`
- Không có cấp tối đa. Giá: `getUpgLvCost(lv) = min(500tr, 1000 × 2^lv)`; từ cấp 19 trở đi 500tr/cấp. Hiệu ứng từ `UPG_LV_CFG[cat].curBonus(lv)` (vd Trà: +0.5% khách/cấp).
- Bị chặn khi đang nợ (`inDebt()`).

## 24. Lỗi game phát hiện khi reverse
- `Garden.waterAll()` / tưới 1 ô hẹn `setTimeout(render, ~750ms)`; `Garden.render()` ghi thẳng vào `#pane` mà không kiểm tra tab → tưới rồi đổi tab trong 0.75s thì nội dung vườn ghi đè tab khác (`garden.js:925`, `:505`, `:560`).

## 25. Tooling
- RE Tool Panel (inject không reload, bảng offset + scanner tự dò khi game update): `tool-panel/README.md`.
