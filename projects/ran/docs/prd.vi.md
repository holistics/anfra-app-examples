# Ran Race Planner — Tài liệu yêu cầu sản phẩm (PRD)

*Cập nhật ngày 15/10/2026 · Để xin góp ý · Bản tiếng Anh: [prd.en.md](prd.en.md) · Khám phá sản phẩm: [pdd.vi.md](pdd.vi.md)*

Race Planner cho người chạy một dự đoán thành tích đáng tin cậy và một giáo án an toàn, tốn ít công sức nhất
để đạt mục tiêu, từ chính dữ liệu Garmin của họ. PRD này nêu sản phẩm phải làm gì, làm sao biết nó hoạt động
đúng, và những gì nằm ngoài phạm vi. Mô hình phía sau được trình bày trong [tài liệu dạng nghiên cứu](research.vi.md).

## 1. Mục tiêu và ngoài mục tiêu

**Mục tiêu**

| # | Mục tiêu | Thước đo | Chỉ tiêu |
|---|---|---|---|
| G1 | Dự đoán đáng tin cậy | Sai số tuyệt đối trung bình trên các cuộc đua người chạy đã đánh dấu, mỗi cuộc đua chỉ được dự đoán từ dữ liệu trước đó | ≤ 5 % (hiện 4.0 %) |
| G2 | Giải thích khoảng cách | Mọi dự đoán được tách thành các thành phần người chạy có thể tác động, tính bằng phút | Hiển thị đủ mọi thành phần |
| G3 | Giáo án an toàn theo mặc định | Giáo án đề xuất nằm trong mọi vùng an toàn theo bằng chứng | 100 % các đề xuất |
| G4 | Ít công sức nhất | Trong các giáo án an toàn đạt mục tiêu, chọn giáo án có tổng km ít nhất | Có, trong bước 2 km của tuần lớn nhất |
| G5 | Phản hồi nhanh | Thời gian dựng lại giáo án sau một thay đổi | ≤ 1.5 s (hiện ~0.8 s) |

**Ngoài mục tiêu (bản phát hành này)**

- Trò chuyện huấn luyện, điều chỉnh hằng ngày, hay đẩy bài tập lên đồng hồ (cần người dùng đồng ý rõ ràng trước).
- Kế hoạch dinh dưỡng, phân phối tốc độ (pacing) hay nạp năng lượng (chỉ tư vấn).
- Tài khoản nhiều người chạy, chia sẻ, ứng dụng di động.

## 2. Người dùng và câu chuyện người dùng

Người dùng chính: một người chạy phong trào có đồng hồ Garmin và một cuộc đua mục tiêu (xem [PDD](pdd.vi.md)).

| # | Là người chạy, tôi muốn… | Để… |
|---|---|---|
| U1 | thấy thành tích của tôi nếu cuộc đua diễn ra hôm nay | tôi biết mình bắt đầu từ đâu, một cách trung thực |
| U2 | thấy mục tiêu cần gì vào ngày đua, về sức bền và thể lực thi đấu | tôi biết cần tập trung vào đâu |
| U3 | được nói rõ khi mục tiêu ngoài tầm với, và điều gì là thực tế | tôi đặt được mục tiêu hợp lý |
| U4 | đặt những gì tôi thực sự kiểm soát (số buổi chạy mỗi tuần, chạy dài, mức tăng, giảm tải) | giáo án phù hợp với cuộc sống của tôi |
| U5 | kéo một thanh trượt công sức từ chạy ít đến chạy nhiều | tôi tìm được sự đánh đổi của mình trong vài giây |
| U6 | thấy vùng an toàn của từng thiết lập và một bước thay đổi đáng bao nhiêu phút | tôi chỉ đẩy ở chỗ đáng giá và vẫn an toàn |
| U7 | thấy các giai đoạn và buổi tập của giáo án theo tốc độ của chính tôi | tôi biết mỗi tuần trông thế nào |
| U8 | lưu giáo án và so sánh với những gì tôi thực sự đã chạy | tôi có thể làm theo và điều chỉnh |

## 3. Yêu cầu chức năng

### Bước 1 — Bạn đang ở đâu

- **FR1.1** Hiển thị thành tích *nếu cuộc đua diễn ra hôm nay*: VO2max hiệu dụng (effective VO2max) và dáng
  marathon (marathon shape) hôm nay đưa qua mô hình, trong điều kiện của cuộc đua, không có giáo án.
- **FR1.2** Hiển thị khoảng cách tới mục tiêu, thể lực thi đấu hôm nay, sức bền hôm nay (dáng marathon, km mỗi
  tuần của 2 tuần trọn vẹn gần nhất, buổi chạy dài nhất trong 4 tuần), thời gian còn lại tới cuộc đua và nhiệt
  độ ngày đua.
- **FR1.3** "Cách tính thế nào?" mở ra phép tính từng bước với mọi con số và nguồn của nó.

### Bước 2 — Cần những gì

- **FR2.1** Tính **giáo án đề xuất** (FR3.4) và cho biết mục tiêu có đạt được không.
- **FR2.2** Nếu đạt được: nói rõ điều đó, kèm tổng km, tuần lớn nhất và thành tích dự đoán của giáo án đề
  xuất, cùng giáo án an toàn nhanh nhất để so sánh.
- **FR2.3** Nếu không: nêu **mục tiêu làm việc** (giáo án an toàn nhanh nhất) và giải thích lý do — dáng
  marathon và thể lực thi đấu mà mục tiêu đòi hỏi, so với mức một giáo án an toàn đạt được. Nếu giáo án đã
  lưu đã tốt bằng, hãy nói "giữ nguyên" và đưa lời khuyên thi đấu ở tốc độ dự đoán.

### Bước 3 — Xây dựng giáo án

- **FR3.1 Các thiết lập điều khiển**, quan trọng nhất trước: tăng tuần (weekly increase), tuần lớn nhất, buổi
  chạy dài nhất, số buổi chạy mỗi tuần (một ràng buộc cuộc sống, mặc định theo thói quen của người chạy), số
  buổi chất lượng, giảm tải (taper), giai đoạn tăng tải (build-up: tăng tải dần hoặc tăng tải sớm; cả hai đều
  xanh lá), cuộc đua thử (tune-up race). Giá trị chính xác (1 km, 1 %); mỗi thiết lập
  hiển thị các giá trị được tô màu theo vùng và số phút mà một bước lên hoặc xuống đáng giá.
- **FR3.2 Các vùng** (xanh lá an toàn · vàng cam thận trọng · đỏ nguy cơ chấn thương):

| Thiết lập | Vàng cam | Đỏ | Nguồn |
|---|---|---|---|
| Tăng tuần | > 10 % | > 20 % | ProjectRun21 (Damsted 2019) |
| Tuần lớn nhất | > 1.25 × tuần lớn nhất của năm qua | — | lịch sử của người chạy |
| Buổi chạy dài nhất | > mức trần thông thường (32 km marathon, 21 km half) | — | đồng thuận huấn luyện; các đột biến theo Frandsen 2025 được ngăn ngay từ cách xây dựng |
| Số buổi chạy mỗi tuần | 7 | — | không có ngày nghỉ |
| Số buổi chất lượng | 0 | — | ngưỡng và VO2max chỉ còn trông vào khối lượng |
| Giảm tải | ngoài 2–3 tuần (marathon), 1–2 (half) | — | Bosquet 2007 |
| Mọi giá trị | sáng ngày đua nằm ngoài dải độ tươi (freshness) 10–30 % | — | mô hình Banister |

- **FR3.3 Thanh trượt công sức**: các vị trí = giáo án an toàn nhanh nhất cho mỗi lượng chạy (biên Pareto
  theo tổng km và thành tích dự đoán); vàng cam ở chỗ không đạt mục tiêu, xanh lá ở chỗ đạt; di chuyển nó sẽ
  đặt mọi thiết lập; một bảng so sánh hiện tại, ít nhất, vị trí này và nhiều nhất. Phím mũi tên đi từng giáo án một.
- **FR3.4 Giáo án đề xuất** = tổng km ít nhất đạt mục tiêu, với mọi thiết lập ở vùng xanh, sáng ngày đua đủ
  tươi và giữ số buổi chạy mỗi tuần của người chạy; nếu không có, chọn giáo án an toàn nhanh nhất.
- **FR3.5 Tạo giáo án**:
  1. Bắt đầu từ tuần hiện tại: các ngày đã qua là lịch sử; phần còn lại được lấp đầy tới khối lượng hiện tại.
  2. Giai đoạn theo thời gian còn lại: ≤ 3 tuần trước giảm tải → mài sắc (sharpen); 4–7 → xây dựng (build),
     đỉnh (peak); 8–12 → nền tảng (base), xây dựng, đỉnh 2 tuần; 13+ → nền tảng ~40 %, xây dựng ~35 %, đỉnh
     3 tuần; sau đó giảm tải và tuần thi đấu.
  3. Giai đoạn tăng tải (build-up), do người chạy chọn: *tăng tải dần (gradual)* (tuần lớn nhất rơi vào giai
     đoạn đỉnh, tăng tuần là mức tối đa) hoặc *tăng tải sớm (front-loaded)* (khối lượng tăng theo mức tăng
     hằng tuần cho đến tuần lớn nhất); dù cách nào, cứ mỗi tuần thứ 4 là một tuần nhẹ hơn.
  4. Buổi chạy dài không bao giờ dài hơn 10 % so với buổi dài nhất của 4 tuần trước, tối đa nửa khối lượng
     tuần; tăng tải dần: khi đã đạt độ dài tối đa, xen kẽ với các buổi chạy trung-dài (3–5 buổi ở độ dài đó);
     tăng tải sớm: tăng nhanh nhất mà quy tắc đó cho phép và giữ ở độ dài tối đa.
  5. Chạy nhẹ từ 5 km đến 3/4 buổi chạy dài; các buổi chất lượng được chọn theo giai đoạn, ở tốc độ của người chạy.
  6. Cuộc đua thử tùy chọn 6 tuần trước tuần thi đấu (HM trước marathon, 10K trước half).
- **FR3.6 Kết quả**: dáng marathon và thể lực thi đấu đêm trước ngày đua (kèm khoảng) → thành tích dự đoán so
  với mục tiêu làm việc, mục tiêu và giáo án đã lưu; đòn bẩy an toàn lớn nhất; các cảnh báo; phép tính và biểu
  đồ thể lực nằm sau nút mở rộng.
- **FR3.7 Lưu**: "Dùng giáo án này" ghi giáo án lại; dự đoán của giáo án đã lưu phải bằng đúng bản xem trước.

### Bước 4 — Giáo án đã lưu (thu gọn)

- **FR4.1** Thể lực, mệt mỏi và phong độ tới ngày đua; trình chỉnh sửa tuần; kế hoạch so với thực tế theo từng ngày.

### Hành vi

- **FR5.1** Trang này không tự động làm mới; sau khi đồng bộ, "Tải lại dữ liệu" giữ nguyên các thiết lập hiện tại.
- **FR5.2** Thay đổi một thiết lập không bao giờ làm thay đổi một thiết lập khác mà người chạy không chạm vào.

## 4. Yêu cầu mô hình

- **MR1** Dự đoán: time = Daniels(VO2max_race × shape factor, distance) × calibration × (1 + heat %) ×
  (1 + taper %). Cùng một phép tính ở bản xem trước (Python) và ở giáo án đã lưu (SQL).
- **MR2** Thể lực thi đấu ngày đua = VO2max hiệu dụng hôm nay + vo2_per_ctl × thay đổi của CTL trung bình 30 ngày.
- **MR3** Hệ số hiệu chỉnh (calibration), ảnh hưởng nhiệt (heat) và vo2_per_ctl được ước lượng bằng
  `garmin-sync fit` sau mỗi lần đồng bộ; khi đo sai số, mỗi cuộc đua chỉ được dự đoán từ các cuộc đua trước đó.
- **MR4** Mọi chỉ số suy diễn đều có công thức và nguồn được ghi lại trong lớp ngữ nghĩa (semantic layer).

## 5. Yêu cầu phi chức năng

| Lĩnh vực | Yêu cầu |
|---|---|
| Quyền riêng tư | Toàn bộ dữ liệu lưu cục bộ (Postgres trên máy người chạy); thông tin đăng nhập chỉ nằm trong các tệp được git bỏ qua; bản demo và video dùng dữ liệu tổng hợp |
| Hiệu năng | Dựng lại giáo án ≤ 1.5 s; biên công sức được lưu đệm theo cuộc đua và số buổi chạy mỗi tuần |
| Tính đúng đắn | Dự đoán ở bản xem trước và ở giáo án đã lưu khớp hoàn toàn (kiểm tra trên một bản sao cơ sở dữ liệu) |
| Khả năng tiếp cận | Mọi ô nhập đều điều khiển được bằng bàn phím; màu sắc không bao giờ là tín hiệu duy nhất (các vùng cũng có nhãn) |

## 6. Tình trạng phát hành

| Hạng mục | Tình trạng |
|---|---|
| Bước 1–4, các thiết lập, thanh trượt công sức, giáo án đề xuất | Đã xây dựng |
| Ước lượng mô hình (nhiệt, hiệu chỉnh, phản ứng thể lực thi đấu) | Đã xây dựng, chạy lại mỗi lần đồng bộ |
| Cấu trúc giáo án dài và cuộc đua thử | Đã xây dựng |
| Chi tiết buổi tập trong ghi chú (khởi động · phần chính · thả lỏng) | Đề xuất |
| Đẩy buổi tập lên đồng hồ | Chưa bắt đầu (cần sự đồng ý) |

## 7. Câu hỏi mở

1. Giáo án đề xuất có nên nhắm một khoảng dư (ví dụ đạt mục tiêu với 2 % dư) thay vì dự đoán điểm không?
2. Giai đoạn tăng tải mặc định (trước khi người chạy chọn) nên là tăng tải dần hay tăng tải sớm? Bằng chứng
   chưa phân biệt được hai cách.
3. Bằng chứng nào sẽ cho phép các buổi chất lượng có tác động riêng lên thể lực thi đấu?
