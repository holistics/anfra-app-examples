# Ran: lập kế hoạch thi đấu từ chính dữ liệu của người chạy — Tài liệu Khám phá Sản phẩm (PDD)

*Cập nhật ngày 15/10/2026 · Để xin góp ý · Bản tiếng Anh: [pdd.en.md](pdd.en.md) · Yêu cầu sản phẩm: [prd.vi.md](prd.vi.md)*

**Vấn đề:** một người chạy phong trào có nhiều năm dữ liệu từ đồng hồ vẫn không thể trả lời câu hỏi "tôi
có chạy được thời gian mục tiêu không, và tập luyện thế nào để đạt được một cách an toàn?" bằng thứ gì tốt
hơn một giáo án chung chung và một dự đoán lạc quan của đồng hồ. **Hướng đi được chọn:** một mô hình nhân
quả, với cấu trúc lấy từ các nghiên cứu khoa học và các con số được ước lượng và kiểm chứng trên chính lịch
sử của người chạy, đặt trong một công cụ lập kế hoạch cho thấy rõ các đánh đổi. Tài liệu này ghi lại cách
chúng tôi đi đến đó và những gì đã bị loại bỏ.

## 1. Không gian vấn đề

### Ai

Một người chạy phong trào (tác giả là người dùng đầu tiên): 3–6 buổi chạy mỗi tuần, 40–60 km/tuần, thi
đấu từ 10K đến marathon, đeo đồng hồ Garmin, tập luyện trong điều kiện nóng (TP. Hồ Chí Minh, WBGT
~30 °C). Mục tiêu trong nghiên cứu này: Tokyo Marathon tháng 3/2027 với thời gian 3:59:59.

### Những việc cần hoàn thành (jobs to be done)

1. *Biết mình đang ở đâu*: một thời gian thi đấu đáng tin, không phải một con số chiều lòng.
2. *Biết mục tiêu đòi hỏi gì*: điểm yếu nào của mình tốn nhiều thời gian nhất.
3. *Có một giáo án làm theo được*: các tuần và buổi tập cụ thể theo tốc độ của mình, trong giới hạn an toàn.
4. *Dùng sức hợp lý*: lượng tập ít nhất mà vẫn đạt mục tiêu, hoặc thời gian tốt nhất với những gì mình có thể bỏ ra.

### Người chạy đang có gì, và còn thiếu gì

| Công cụ | Cung cấp | Khoảng trống phát hiện trong quá trình khám phá |
|---|---|---|
| Dự đoán thành tích của Garmin | Một con số cho mỗi cự ly | Hộp đen; nhanh hơn thực tế trung bình 12 % trên 9 giải của người chạy này; cuộc marathon mất nhiều thời gian hơn dự đoán 23 % |
| Trạng thái tập luyện, khối lượng tập (load) của Garmin | Xu hướng thể lực và khối lượng tập | Không gắn với một giải hay mục tiêu cụ thể |
| Runalyze | VDOT, dáng marathon (marathon shape), dự báo | Ý tưởng mạnh, nhưng không hiệu chỉnh theo người chạy, không có lập kế hoạch |
| Giáo án chung (sách, ứng dụng) | Lịch tập hằng tuần | Không khớp với khối lượng hiện tại; áp cùng quy tắc cho mọi người |
| Huấn luyện viên | Đánh giá chuyên môn | Chi phí; hiếm khi dựa trên dữ liệu |

## 2. Nghiên cứu nói gì

Các phát hiện từ quá trình tổng quan tài liệu đã định hình sản phẩm (tài liệu tham khảo đầy đủ trong
[tài liệu dạng nghiên cứu](research.vi.md#tài-liệu-tham-khảo)):

1. **Thành tích thi đấu có cấu trúc đã được biết rõ.** VO2max, tỷ lệ sử dụng (fractional utilisation),
   tức ngưỡng (threshold), và tính kinh tế khi chạy (running economy) (Joyner & Coyle 2008), cộng thêm
   **độ bền (durability)** ở giai đoạn cuối của các cự ly dài (Hunter & Muniz-Pumares 2025).
2. **Với marathon, khối lượng tập là yếu tố dự báo mạnh nhất trong tập luyện.** Quãng đường mỗi tuần, số
   buổi chạy, buổi chạy dài nhất và số buổi chạy từ 32 km trở lên đều gắn với thời gian nhanh hơn (phân
   tích tổng hợp, J Sci Med Sport 2020; Tanda 2013; Vickers & Vertosick 2016).
3. **Phản ứng của từng cá nhân rất khác nhau** (Bonet và cộng sự 2020): các công thức dựa trên quần thể cần
   được hiệu chỉnh theo từng người — đó là lý do cho cách tiếp cận n = 1.
4. **Nguy cơ chấn thương đến từ những lần tăng đột biến, không phải từ tổng khối lượng.** Tăng 20–60 % mỗi
   tuần khiến nhiều người chạy bị chấn thương hơn trong vòng 3 tuần (ProjectRun21, Damsted 2019); một buổi
   chạy dài hơn 10 % so với buổi dài nhất trong 30 ngày trước đó làm tăng chấn thương do quá tải
   (Garmin-RUNSAFE, Frandsen 2025, 5.200 người chạy). Tỷ số cấp tính:mạn tính (acute:chronic ratio) vẫn còn
   gây tranh cãi (Impellizzeri 2020).
5. **Giảm tải (taper) có hiệu quả**: giảm 41–60 % khối lượng trong 8–14 ngày, giữ nguyên cường độ
   (Bosquet 2007).
6. **Các yếu tố ngày thi đấu có ảnh hưởng lớn**: nắng nóng (Ely 2007), và cách phân phối tốc độ (pacing) —
   28 % nam và 17 % nữ "đụng tường" (hit the wall) (Smyth 2021).

## 3. Các phương án giải pháp đã cân nhắc

| Phương án | Cách dự đoán | Giữ lại? | Lý do |
|---|---|---|---|
| A. Hiển thị dự đoán của Garmin | Mô hình của Garmin | Chỉ để so sánh | Không minh bạch; sai số 12,0 % với người chạy này |
| B. Garmin, hiệu chỉnh theo các giải đã chạy | Garmin × tỷ số trung bình của người chạy | Chỉ để so sánh | Sai số 6,2 %; vẫn không nói được *vì sao* |
| C. Riegel từ giải gần nhất | T₂ = T₁ × (D₂/D₁)^1.06 | Loại bỏ | Sai số 7,9 %; không gắn với tập luyện |
| D. Tanda (marathon) | Km mỗi tuần và tốc độ tập | Chỉ để so sánh | Chỉ được kiểm chứng cho người về đích 2:47–3:36; sai 13,6 % với giải marathon của người chạy này |
| E. Daniels từ VO2max hiệu dụng (effective VO2max), có hiệu chỉnh | VO2max → thời gian | Thành phần nền | Sai số 5,9 %; bỏ qua sức bền |
| **F. Mô hình nhân quả: VO2max × dáng marathon, có hiệu chỉnh, nhiệt, độ tươi** | Daniels trên VO2max, nhân với hệ số dáng (shape factor) của Runalyze, hiệu chỉnh theo người chạy | **Được chọn** | Sai số **4,0 %** (3,7 % nếu bỏ bước nhiệt), và mỗi thành phần ứng với một điều người chạy có thể tập |
| G. Mô hình hộp đen (ML) trên dữ liệu của người chạy | Ước lượng từ các đặc trưng | Loại bỏ | 9 giải không đủ để huấn luyện; không giải thích được |

**Vì sao chọn F.** Đây là phương án chính xác nhất (mỗi giải chỉ được dự đoán từ các giải trước đó), và là
phương án duy nhất mà các thành phần là *đòn bẩy*: khối lượng thay đổi dáng marathon, khối lượng tập làm
thay đổi VO2max, giảm tải thay đổi độ tươi. Điều đó biến một dự đoán thành một kế hoạch.

## 4. Các phương án lập kế hoạch đã cân nhắc

| Câu hỏi | Các phương án | Được chọn |
|---|---|---|
| "Giáo án tốt nhất" nghĩa là gì? | Giáo án nhanh nhất · ít công sức nhất mà vẫn đạt mục tiêu | **Ít công sức nhất mà vẫn đạt mục tiêu** (nếu không thì giáo án an toàn nhanh nhất) |
| Người chạy điều khiển thế nào? | Nhiều thanh trượt · một "bản đồ mục tiêu" 2 chiều · một thanh trượt công sức + các tham số | **Thanh trượt công sức + các tham số**: bản đồ mục tiêu khó dùng (giới hạn chỉ hiện ra sau khi thả chuột) |
| Thể lực thi đấu là đầu vào hay đầu ra? | Giả định của người dùng · ước lượng theo khối lượng tập | **Ước lượng**: +0,11 VO2max cho mỗi điểm thể lực 30 ngày (CTL), từ lịch sử của người chạy |
| Thế nào là an toàn? | Chỉ quy tắc 10 % · các vùng theo bằng chứng | **Vùng theo bằng chứng**: mức tăng mỗi tuần, đột biến ở một buổi chạy, tuần lớn nhất so với lịch sử, độ dài giảm tải |
| Giáo án dài được cấu trúc thế nào? | Tăng khối lượng theo mức tăng hằng tuần (tăng tải sớm, front-loaded) · trải đều để đạt đỉnh ở giai đoạn đỉnh (tăng tải dần, gradual) | **Người chạy tự chọn**: cả hai đều nằm trong giới hạn chấn thương và chưa có nghiên cứu nào so sánh chúng; phần đề xuất tìm trên cả hai. Thêm một giải chạy thử (tune-up race) |

## 5. Bằng chứng từ chính dữ liệu của người chạy

- Mô hình nhân quả đã hiệu chỉnh dự đoán 9 giải của người chạy này với sai số trung bình **4,0 %**.
- Cuộc marathon mất **nhiều thời gian hơn 39 %** so với dự đoán của Daniels thuần túy; khi có hệ số dáng marathon, còn 12 %, tương đương các giải half.
- Ảnh hưởng của nhiệt là **0,55 % cho mỗi °C WBGT** (khoảng tin cậy 95 % từ −0,3 đến 1,1; 119 buổi chạy).
- Thể lực thi đấu đi theo khối lượng tập: **+0,110 VO2max cho mỗi điểm CTL** (95 % 0,03–0,19; 148 cửa sổ).

## 6. Rủi ro và câu hỏi mở

1. **n = 1.** Mới kiểm chứng trên một người chạy và 9 giải (một marathon). Bước tiếp theo: một người chạy
   thứ hai, và người chạy tổng hợp (synthetic runner) có tham số thực đã biết trước.
2. **Giai đoạn tăng tải (build-up).** Tăng tải dần (gradual) cho dự đoán chậm hơn tăng tải sớm (front-loaded)
   (~8–10 phút với Tokyo) vì công thức dáng marathon ưu ái khối lượng sớm. Chưa cách nào được chứng minh là an
   toàn hơn: cả hai đều tôn trọng giới hạn của bằng chứng về mức tăng hằng tuần và đột biến ở từng buổi chạy.
   Ran cung cấp cả hai.
3. **Các buổi tập chất lượng (quality sessions)** không có tác động riêng trong mô hình ngoài khối lượng tập.
4. **Độ tươi (freshness)** là một hệ số cố định 2 % và đánh giá thấp tác dụng của giảm tải; vì vậy độ dài
   giảm tải được giới hạn theo các mức mà bằng chứng ủng hộ.
5. **Cách thực hiện trong ngày thi đấu** (phân phối tốc độ, nạp năng lượng) chưa được mô hình hóa — chỉ
   đưa ra lời khuyên.

## 7. Bước tiếp theo

Các yêu cầu cho hướng đi được chọn nằm trong [PRD](prd.vi.md).
