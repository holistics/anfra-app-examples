# Ran: công cụ lập kế hoạch thi đấu dựa trên bằng chứng — Tài liệu sản phẩm tổng quan (HPD)

*Cập nhật ngày 15/10/2026 · Để xin góp ý từ đồng nghiệp, bạn bè và cố vấn · Bản tiếng Anh: [hpd.en.md](hpd.en.md)*

Ran biến toàn bộ lịch sử Garmin của một người chạy thành dự đoán thành tích thi đấu và giáo án tập luyện.
Cấu trúc của mô hình đến từ các nghiên cứu khoa học thể thao; các con số trong mô hình được ước lượng từ
chính dữ liệu của người chạy và kiểm chứng với các cuộc đua họ đã chạy. Với người chạy, Ran trả lời ba câu
hỏi: tôi đang ở đâu, mục tiêu của tôi đòi hỏi những gì, và cách tập nào giúp tôi đạt được với ít công sức nhất.

## 1. Vì sao: vấn đề

Người chạy chuẩn bị cho một cuộc đua hiện nhận được hai kiểu hỗ trợ, và cả hai cùng yếu ở một điểm: bạn
không thấy được vì sao chúng đưa ra kết luận như vậy.

| Hiện nay | Điều gì chưa ổn |
|---|---|
| **Dự đoán thành tích trên đồng hồ** (ví dụ Garmin) | Không minh bạch, và thường lạc quan một cách có hệ thống với nhiều người chạy. Trên 9 cuộc đua đã đánh dấu của tác giả, dự đoán của Garmin trung bình **nhanh hơn thực tế 12 %**; cuộc marathon mất nhiều thời gian hơn dự đoán 23 %. |
| **Giáo án chung chung** (sách, ứng dụng) | Các quy tắc kinh nghiệm ("+10 % mỗi tuần", "chạy dài tối đa 32 km") áp dụng cho mọi người, không gắn với thể lực hiện tại, lịch sử tập hay thời gian mục tiêu của người chạy. |
| **Huấn luyện viên** | Tốt, nhưng đắt, và phần lớn vẫn suy luận từ kinh nghiệm thay vì từ dữ liệu của người chạy. |

Điều còn thiếu là một công cụ **giải thích được**: yếu tố nào đang giới hạn người chạy này, mỗi yếu tố
làm mất bao nhiêu phút, cách tập nào cải thiện từng yếu tố, và giới hạn an toàn nằm ở đâu.

## 2. Cái gì: sản phẩm qua ba bước

Trang Race Planner gồm ba bước trên một trang, phần chi tiết nằm sau nút "mở rộng".

1. **Bạn đang ở đâu.** Thời gian thi đấu nếu cuộc đua diễn ra hôm nay, tính từ thể lực và sức bền hiện
   tại, cùng khoảng cách tới mục tiêu. Ví dụ (Tokyo Marathon, tháng 3/2027): **5:04 hôm nay** so với mục
   tiêu 3:59:59.
2. **Mục tiêu đòi hỏi gì.** Mục tiêu được chuyển thành những gì bạn cần có vào ngày đua: dáng marathon
   (marathon shape, tức sức bền) và thể lực thi đấu (VO2max hiệu dụng, effective VO2max) — và liệu một
   giáo án an toàn có đưa bạn tới đó trong thời gian còn lại hay không. Nếu không, thời gian thực tế tốt
   nhất trở thành mục tiêu làm việc, kèm lý do.
3. **Xây dựng giáo án.** Những gì bạn kiểm soát — số buổi chạy mỗi tuần, số buổi tập chất lượng, buổi
   chạy dài nhất, mức tăng mỗi tuần, tuần khối lượng lớn nhất, giảm tải (taper), một cuộc đua thử sức tùy
   chọn — rồi đến giáo án (các giai đoạn với buổi tập cụ thể theo tốc độ của chính bạn), rồi đến trạng
   thái của bạn vào ngày đua.

Ba tính năng mang lại phần lớn giá trị:

- **Giáo án được đề xuất là giáo án ít công sức nhất mà vẫn đạt mục tiêu**: ít tổng số km nhất, mọi
  thiết lập đều nằm trong vùng an toàn và sáng ngày đua cơ thể còn tươi. Với Tokyo, đó là 728 km thay vì
  816 km của giáo án an toàn nhanh nhất, nhanh hơn mục tiêu 9 giây.
- **Thanh trượt công sức**: mỗi vị trí là giáo án an toàn nhanh nhất cho lượng chạy tương ứng, từ ít nhất
  đến nhiều nhất.
- **Vùng an toàn trên mọi thiết lập**, dựa trên nghiên cứu về chấn thương: mức tăng mỗi tuần trên 20 %
  (ProjectRun21), một buổi chạy dài hơn 10 % so với buổi dài nhất trong 30 ngày (Garmin-RUNSAFE 2025),
  giảm tải ngoài khoảng 2–3 tuần (Bosquet 2007).

## 3. Như thế nào: mô hình trong một cái nhìn

```
 What you control            The plan                On race day                  Result
 ─────────────────           ────────────            ─────────────                ──────────
 runs per week        ─┐     phases: base,     ─┬─►  Marathon shape   ─┐
 quality sessions      │     build, peak,       │    (endurance)        │
 longest long run      ├──►  taper, race week ──┤                       ├──►  Race time
 weekly increase       │     sessions at your   ├─►  Race fitness      ─┤      vs goal
 biggest week          │     own paces          │    (effective VO2max) │
 taper, tune-up race  ─┘                        └─►  Freshness         ─┘
                                                     (form on race morning)
                       fixed: race-day heat, and how this runner races against the formulas
```

*Chú giải:* What you control = những gì bạn kiểm soát (số buổi chạy mỗi tuần, số buổi tập chất lượng,
buổi chạy dài nhất, mức tăng mỗi tuần, tuần lớn nhất, giảm tải và cuộc đua thử sức) · The plan = giáo án
(các giai đoạn nền tảng, xây dựng, đỉnh, giảm tải, tuần thi đấu; buổi tập theo tốc độ của bạn) · On race
day = vào ngày đua: dáng marathon (sức bền), thể lực thi đấu (VO2max hiệu dụng), độ tươi (phong độ sáng
ngày đua) · Result = kết quả: thời gian thi đấu so với mục tiêu · fixed = cố định: nhiệt độ ngày đua, và
cách người chạy này thi đấu so với công thức.

Trong một dòng: **thời gian = Daniels(VO2max × hệ số dáng, cự ly) × hiệu chỉnh × nhiệt × độ tươi.**

- **Thể lực thi đấu** là VO2max hiệu dụng của người chạy (tính từ tốc độ so với nhịp tim), được điều
  chỉnh theo mức giáo án nâng thể lực: +0,11 VO2max cho mỗi điểm tải tập luyện, ước lượng từ chính lịch
  sử của họ.
- **Dáng marathon** (Runalyze) đo sức bền từ số km trong 26 tuần và các buổi chạy dài trong 10 tuần; khi
  thấp hơn mức một cự ly đòi hỏi, chỉ một phần VO2max dùng được trên cự ly đó.
- **Hiệu chỉnh** là bước n = 1: trên các cuộc đua đã chạy của người này, các công thức lạc quan hơn thực
  tế 7,9 %, nên mọi dự đoán được nhân với hệ số đó.
- **Nhiệt** dùng hiệu ứng nhiệt riêng của người chạy (0,55 % mỗi °C WBGT); **độ tươi** dùng mô hình thể
  lực – mệt mỏi của Banister trên tải tính từ nhịp tim từng giây (TRIMP).

## 4. Bằng chứng: điều gì hỗ trợ từng phần

| Phần của mô hình | Bằng chứng | Mức độ |
|---|---|---|
| Ba yếu tố sinh lý quyết định: VO2max, ngưỡng, tính kinh tế khi chạy | Joyner & Coyle 2008 | Mạnh, kinh điển |
| Độ bền (durability) là yếu tố quyết định thứ tư | Hunter & Muniz-Pumares 2025; độ lệch nhịp tim (decoupling) ở 82.000 người chạy marathon | Đang tăng |
| Thời gian thi đấu từ VO2max | Daniels & Gilbert (VDOT) | Mạnh, dùng rộng rãi |
| Khối lượng sức bền giới hạn thành tích marathon | Dáng marathon của Runalyze; Tanda 2013; phân tích gộp về các yếu tố tập luyện (J Sci Med Sport 2020) | Trung bình |
| Thể lực và mệt mỏi từ tải tập luyện | Mô hình xung – đáp ứng Banister (Morton và cộng sự 1990) | Trung bình; nhạy với cách đo tải |
| Nhiệt làm người chạy chậm lại | Ely và cộng sự 2007 | Mạnh |
| Giảm tải 41–60 % trong 8–14 ngày | Bosquet 2007; Mujika & Padilla 2003 | Mạnh |
| Giới hạn chấn thương | ProjectRun21 (Damsted 2019); Garmin-RUNSAFE (Frandsen 2025); phê bình chỉ số ACWR (Impellizzeri 2020) | Trung bình |
| Phân phối tốc độ và "đụng tường" | Smyth 2021 | Mạnh (quan sát, mẫu lớn) |

Tài liệu dạng nghiên cứu trình bày đầy đủ phương pháp và tài liệu tham khảo.

## 5. Hiện trạng

- **Đã xây dựng** (tháng 10/2026): đồng bộ Garmin vào Postgres; một lớp ngữ nghĩa (Anfra) với mọi chỉ số
  được mô tả; ba trang (Overview, Activities, Race Planner); việc ước lượng mô hình, chạy lại sau mỗi
  lần đồng bộ.
- **Độ chính xác dự đoán** trên 9 cuộc đua đã đánh dấu (6 bán marathon, 2 × 10K, 1 marathon), mỗi cuộc
  đua chỉ được dự đoán từ dữ liệu trước nó:

| Phương pháp | Sai số tuyệt đối trung bình |
|---|---|
| **Mô hình nhân quả của Ran, đã hiệu chỉnh** | **4,0 %** |
| Dự đoán của Garmin, đã hiệu chỉnh | 6,2 % |
| Dự đoán của Garmin, như hiển thị trên đồng hồ | 12,0 % |

- **Tính nhất quán:** bản xem trước giáo án và dự đoán của giáo án đã lưu cho ra các con số giống hệt
  nhau (đã kiểm tra trên một bản sao cơ sở dữ liệu).
- **Chưa có:** người chạy thứ hai, kiểm chứng một giáo án đề xuất trong cuộc đua thật, giao diện di động.

## 6. Câu hỏi mở — những điểm cần góp ý

1. **"Ít công sức nhất mà vẫn đạt mục tiêu" có nên là mặc định?** Giáo án đạt mục tiêu theo dự đoán,
   không có biên an toàn (±4 %). Có nên nhắm tới một biên an toàn thay vào đó?
2. **Tăng tải dần (gradual) hay tăng tải sớm (front-loaded)?** Cả hai đều nằm trong giới hạn của bằng chứng
   về chấn thương (mức tăng hằng tuần, đột biến ở từng buổi chạy); chưa có nghiên cứu nào so sánh hai cách.
   Tăng tải sớm nghĩa là chạy nhiều hơn và dự đoán nhanh hơn (mô hình ưu ái khối lượng sớm); tăng tải dần
   nghĩa là chạy ít hơn. Ran để người chạy chọn và tìm trên cả hai cách khi đề xuất. Đó có phải lựa chọn đúng?
3. **Buổi tập chất lượng** chỉ được tính qua tải tập luyện: chưa có nghiên cứu nào cho mức tăng VO2max
   theo từng buổi mà chúng tôi dùng được. Có bằng chứng nào chúng tôi bỏ sót?
4. **Khả năng tổng quát hóa.** Mọi thứ được ước lượng trên một người chạy (n = 1). Điều gì sẽ thuyết phục
   bạn rằng nó đúng với người khác?
5. **Điều gì gây khó hiểu** trên trang, và bạn sẽ bỏ bớt điều gì?

## Nguồn tham khảo

Xem danh sách tài liệu tham khảo trong tài liệu dạng nghiên cứu ([research.vi.md](research.vi.md#tài-liệu-tham-khảo)).
