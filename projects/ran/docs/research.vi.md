# Mô hình nhân quả được hiệu chỉnh cho dự báo thành tích cá nhân và giáo án tập luyện ít công sức nhất: một nghiên cứu n = 1

*Bản nháp xin góp ý, 15/10/2026 · Bản tiếng Anh: [research.en.md](research.en.md) · Tài liệu sản phẩm: [HPD](hpd.vi.md), [PDD](pdd.vi.md), [PRD](prd.vi.md)*

## Tóm tắt

**Mục tiêu.** Dự báo thời gian thi đấu của một người chạy từ chính dữ liệu tập luyện của họ, bằng một
mô hình mà mỗi thành phần là một yếu tố sinh lý quyết định có thể tập luyện được, và từ đó suy ra giáo
án an toàn, ít công sức nhất để đạt mục tiêu.
**Phương pháp.** Ba năm dữ liệu Garmin của một người chạy nghiệp dư (nhịp tim, tốc độ, GPS theo từng
giây) được nạp vào một cơ sở dữ liệu cục bộ. Dự báo kết hợp quan hệ VO2max–thành tích của Daniels &
Gilbert, áp dụng cho *VO2max hiệu dụng (effective VO2max)* ước lượng từ tốc độ so với nhịp tim; hệ số
*dáng marathon (marathon shape)* của Runalyze cho sức bền; một hệ số hiệu chỉnh theo chính các cuộc đua
của người chạy; ảnh hưởng của nhiệt được ước lượng riêng cho người này; và một thành phần thể lực – mệt
mỏi (fitness–fatigue) của Banister. VO2max ngày đua được dự phóng từ tải tập luyện (training load) theo
kế hoạch, với hệ số đáp ứng ước lượng trên lịch sử của người chạy. Độ chính xác được đo trên 9 cuộc đua
đã đánh dấu (6 bán marathon, hai 10 km, một marathon), mỗi cuộc chỉ được dự báo từ dữ liệu trước nó.
Giáo án được tạo trong các giới hạn chấn thương dựa trên bằng chứng, và giáo án ít công sức nhất (ít
tổng số km nhất) mà vẫn đạt mục tiêu được chọn.
**Kết quả.** Mô hình nhân quả đã hiệu chỉnh có sai số tuyệt đối trung bình **4.0 %** (3.7 % khi bỏ
thành phần nhiệt), so với 6.2 % của dự đoán từ hãng đồng hồ khi được hiệu chỉnh cùng cách và 12.0 % khi
không hiệu chỉnh. Thêm hệ số dáng marathon làm độ phân tán của tỉ số thực tế/dự đoán giảm một nửa (SD
0.092 → 0.041) và giảm mức hụt ở marathon (thời gian thực tế vượt dự đoán) từ 39 % xuống 12 %. Nhiệt làm người chạy này chậm đi 0.55 % mỗi
°C WBGT (KTC 95 % −0.3 đến 1.1). VO2max hiệu dụng tăng 0.110 cho mỗi điểm tải tập luyện trung bình 30
ngày (KTC 95 % 0.032–0.189).
**Kết luận.** Các công thức quần thể mang phần lớn cấu trúc; một lần hiệu chỉnh theo người chạy loại bỏ
phần lớn độ lệch của chúng; và việc biến mỗi thành phần thành một đòn bẩy có thể tập luyện biến dự báo
thành công cụ lập kế hoạch. Cơ sở bằng chứng là một người chạy và chín cuộc đua; khả năng khái quát hoá
chưa được kiểm chứng.

## 1. Giới thiệu

Các công cụ dự đoán thành tích trên đồng hồ tiện lợi nhưng thiếu minh bạch, và thường lạc quan: với người
chạy được nghiên cứu ở đây, đồng hồ dự đoán 9 cuộc đua của người chạy nhanh hơn thực tế trung bình 12 %. Còn các
giáo án tập luyện thì áp dụng quy tắc chung cho quần thể (ví dụ "+10 % mỗi tuần") mà không xét đến tình
trạng hay mục tiêu của người chạy.

Hai phát hiện làm khung cho công trình này. Thứ nhất, thành tích chạy có cấu trúc đã được mô tả rõ: năng
lực hiếu khí (VO2max), tỉ lệ của nó có thể duy trì trong suốt thời gian đua (ngưỡng — threshold), hiệu
quả chạy (running economy) [1][2], và — với cự li dài — độ bền (durability) [3][4]. Thứ hai, mỗi cá nhân
đáp ứng rất khác nhau với cùng một bài tập [10], nên các công thức quần thể cần được hiệu chỉnh theo từng
người. Vì vậy chúng tôi lấy **cấu trúc từ y văn** và **độ lớn từ dữ liệu của người chạy**, rồi kiểm định
trên chính các cuộc đua của người chạy.

## 2. Mô hình nhân quả

### 2.1 Cấu trúc

| Tầng | Nội dung |
|---|---|
| 0 · Kết quả | Thời gian đua = f(cự li, trạng thái người chạy ngày đua, điều kiện, cách thực hiện) |
| 1 · Yếu tố quyết định | D1 VO2max · D2 ngưỡng (tỉ lệ sử dụng — fractional utilisation) · D3 hiệu quả chạy · D4 độ bền · D5 độ tươi (freshness) · D6 nhiệt · D7 đường đua · D8 cách thực hiện · D9 khối lượng cơ thể · D10 chấn thương hoặc bệnh |
| 2 · Tập luyện → yếu tố quyết định | Khối lượng → D4 (và D1, D3); chạy dài → D4; bài ngưỡng → D2; interval → D1; sức mạnh → D3; tổng tải → D5; giảm tải (taper) → D5; tăng đột biến → nguy cơ D10 |

D3 (hiệu quả chạy) không đo được ngoài phòng thí nghiệm; nó đi vào mô hình qua VO2max hiệu dụng (vốn đã
hấp thụ nó) và qua hệ số hiệu chỉnh. D7 được xử lý bằng tốc độ điều chỉnh theo độ dốc (grade-adjusted
pace); D8 và D10 được tư vấn và cảnh báo, không được mô hình hoá.

### 2.2 Phương trình dự báo

```latex
T = T_{\mathrm{Daniels}}\left(\mathrm{VO_2}_{\mathrm{race}} \cdot s(\mathrm{shape}, D),\ D\right)\cdot c \cdot \left(1 + \frac{h\,(W_{\mathrm{race}} - W_{\mathrm{train}})}{100}\right)\cdot\left(1 + \frac{\tau}{100}\right)
```

trong đó *D* là cự li, *s* là hệ số dáng (§2.4), *c* là hệ số hiệu chỉnh (§3.5), *h* là ảnh hưởng của
nhiệt tính bằng % mỗi °C, *W* là WBGT ngày đua và khi tập (§3.4), và *τ* là mức phạt giảm tải 2 %, chỉ
áp dụng khi phong độ (form) sáng ngày đua rơi xuống dưới dải mục tiêu (§2.6).

### 2.3 VO2max hiệu dụng và quan hệ Daniels (D1, D3)

Với mỗi buổi chạy, chi phí oxy ứng với tốc độ trung bình *v* (m/phút) và tỉ lệ VO2max suy ra từ nhịp tim
cho ra một VO2max hiệu dụng [14]:

```latex
\mathrm{VO_2}(v) = -4.60 + 0.182258\,v + 0.000104\,v^2, \qquad \mathrm{VO_2max_{eff}} = \frac{\mathrm{VO_2}(v)}{(\mathrm{HR}/\mathrm{HR_{max}} - 0.37)/0.64}
```

Giá trị theo ngày là trung bình có trọng số theo thời lượng trong 30 ngày. Thời gian đua ứng với một
VO2max được tìm bằng cách giải quan hệ Daniels & Gilbert, với tỉ lệ có thể duy trì cho một cuộc đua kéo
dài *t* phút:

```latex
f(t) = 0.8 + 0.1894393\,e^{-0.012778\,t} + 0.2989558\,e^{-0.1932605\,t}, \qquad \mathrm{VO_2max} = \frac{\mathrm{VO_2}(D/t)}{f(t)}
```

### 2.4 Sức bền: dáng marathon (D4 và khối lượng)

Dáng marathon của Runalyze [15] chấm điểm sức bền từ quãng đường 26 tuần gần nhất và các buổi chạy từ 13
km trở lên trong 10 tuần gần nhất (*d*, km; tuổi buổi chạy *a*, ngày), so với VO2max:

```latex
\mathrm{shape} = 100\left[\frac{2}{3}\cdot\frac{\mathrm{km}_{182\,d}/26}{\mathrm{VO_2max}^{1.135}} + \frac{1}{3}\cdot\frac{1}{10}\sum_{d \ge 13}\left(2 - \frac{2a}{70}\right)\left(\frac{d - 13}{12\ln(\mathrm{VO_2max}/4) - 13}\right)^2\right]
```

Một cự li cần dáng *D*^1.23 % (khoảng 43 % cho bán marathon, 100 % cho marathon). Thấp hơn mức đó, chỉ
một phần VO2max dùng được trên cự li:

```latex
s = \min\left(1,\ 0.6 + 0.4\,\max\left(0,\ 1 - \frac{D^{1.23} - \mathrm{shape}}{100}\right)\right)
```

### 2.5 Thể lực đua ngày thi đấu (tập luyện → D1)

VO2max hiệu dụng ngày đua được dự phóng từ tải tập luyện theo kế hoạch:

```latex
\mathrm{VO_2}_{\mathrm{race}} = \mathrm{VO_2max_{eff,today}} + b \cdot \left(\overline{\mathrm{CTL}}_{30,\ \mathrm{race\ eve}} - \overline{\mathrm{CTL}}_{30,\ \mathrm{today}}\right)
```

với *b* được ước lượng trên lịch sử của người chạy (§3.6) và CTL là chỉ số thể lực 42 ngày ở §2.6.

### 2.6 Độ tươi (D5)

Tải tập luyện là TRIMP của Banister tính từ nhịp tim theo từng giây [5]: với HRr = (HR − HR_rest)/(HR_max − HR_rest),

```latex
\mathrm{TRIMP} = \sum \Delta t \cdot \mathrm{HRr} \cdot 0.64\,e^{1.92\,\mathrm{HRr}}
```

(0.86 và 1.67 với nữ). Thể lực (CTL) và mệt mỏi (ATL) là các trung bình có trọng số luỹ thừa với hằng số
thời gian 42 và 7 ngày; phong độ (TSB) = CTL − ATL. Mục tiêu sáng ngày đua là TSB bằng 10–30 % CTL, tức
mức +15 đến +25 của Allen & Coggan được làm cho không phụ thuộc thang đo tải [16]. Một đợt giảm tải rơi
xuống dưới dải này bị phạt 2 % (Bosquet 2007 [17]; Mujika & Padilla báo cáo ~3 % [18]).

## 3. Dữ liệu và phương pháp

### 3.1 Dữ liệu

Một người chạy nghiệp dư ở TP. Hồ Chí Minh (hồ sơ Garmin: nam, dùng để chọn hệ số TRIMP), dữ liệu Garmin
từ tháng 9/2023 đến tháng 10/2026: 633 hoạt động (426 buổi chạy), 1,57 triệu mẫu theo từng giây, lap, tóm
tắt hằng ngày (nhịp tim nghỉ, giấc ngủ, HRV) và lịch sử ngưỡng lactate. Thời tiết theo giờ cho mọi hoạt động ngoài trời lấy từ Open-Meteo (tái phân tích ERA5) [19]. Toàn
bộ được lưu cục bộ trong PostgreSQL; các chỉ số dẫn xuất được định nghĩa trong một tầng ngữ nghĩa
(semantic layer) có tài liệu đầy đủ.

### 3.2 Các cuộc đua

Người chạy đánh dấu 9 cuộc đua đã qua kèm thời gian chính thức (6 bán marathon, 2 × 10 km, 1 marathon:
tháng 3/2026, 4:38). Cuộc đua mục tiêu: Tokyo Marathon (tháng 3/2027, mục tiêu 3:59:59).

### 3.3 Kiểm tra tải tập luyện

TRIMP tương quan r = 0.81 với chỉ số tải riêng của đồng hồ (dựa trên EPOC), ở mức khoảng 0.68 thang đo
của nó.

### 3.4 Ảnh hưởng của nhiệt (D6)

WBGT được ước lượng từ nhiệt độ và độ ẩm bằng công thức trong bóng râm của Cục Khí tượng Úc [20]: WBGT =
0.567 T + 0.393 e + 3.94 (e = áp suất hơi nước, hPa). Trên 119 buổi chạy đều ngoài trời từ 20 phút trở
lên, log tốc độ tại một nhịp tim dễ cố định (77 % HRmax) được hồi quy theo WBGT, một xu hướng thể lực
tuyến tính từng đoạn (nút mỗi 180 ngày) và log thời lượng; khoảng 95 % bằng bootstrap (2,000 lần lấy mẫu
lại).

### 3.5 Hiệu chỉnh và quy trình kiểm định

Với mỗi cuộc đua đã đánh dấu và mỗi phương pháp, cuộc đua được dự báo từ dữ liệu tính đến ngày hôm
trước. Các phương pháp "đã hiệu chỉnh" được nhân với tỉ số thực tế/dự đoán trung bình của cùng phương
pháp trên **chỉ các cuộc đua trước đó**. Dải bất định của dự báo là sai số tuyệt đối trung bình của
phương pháp đó.

### 3.6 Đáp ứng của thể lực đua

Trên các cửa sổ bắt đầu mỗi 7 ngày, thay đổi 84 ngày của VO2max hiệu dụng được hồi quy theo thay đổi của
CTL trung bình 30 ngày; khoảng 95 % bằng bootstrap trên các cửa sổ. Một thành phần WBGT đã được thử và bị
loại (sai dấu, phù hợp với nhiễu do mùa).

### 3.7 Lập kế hoạch

Giáo án được tạo từ bảy tham số điều khiển: số buổi chạy mỗi tuần (giữ như một ràng buộc cuộc sống), số
buổi chất lượng, buổi chạy dài nhất, mức tăng tuần (weekly increase — là mức tối đa), tuần lớn nhất, độ
dài giảm tải, và một cuộc đua thử (tune-up race) tuỳ chọn. Các quy tắc, mỗi quy tắc dựa trên bằng chứng:

| Quy tắc | Giá trị | Bằng chứng |
|---|---|---|
| Khởi đầu | tuần hiện tại; tải = trung bình 2 tuần trọn vẹn gần nhất | — |
| Giai đoạn | ≤ 3 tuần trước giảm tải: mài sắc; 4–7: xây dựng–đỉnh; 8–12: nền–xây dựng–đỉnh; 13+: nền ~40 %, xây dựng ~35 %, đỉnh 3 tuần | thực hành phân kỳ |
| Giai đoạn tăng tải (build-up) | người chạy chọn: tăng tải dần (gradual; tuần lớn nhất ở giai đoạn đỉnh, chạy dài xen kẽ) hoặc tăng tải sớm (front-loaded; khối lượng tăng theo mức tăng hằng tuần đến tuần lớn nhất); cứ tuần thứ 4 ở mức 75 % | cả hai nằm trong các giới hạn bên dưới; chưa có nghiên cứu nào so sánh |
| Mức tăng tuần | thận trọng > 10 %, nguy cơ chấn thương > 20 % | ProjectRun21 [21]; Nielsen 2014 [22] |
| Chạy dài | không bao giờ dài hơn 10 % so với buổi dài nhất 4 tuần qua; ≤ nửa tuần; luân phiên khi đã đạt mức dài nhất | Garmin-RUNSAFE [23] |
| Tuần lớn nhất | thận trọng khi vượt 1.25 × tuần lớn nhất trong năm qua | lịch sử của người chạy |
| Giảm tải | 2–3 tuần (marathon), 1–2 (bán marathon); giảm 41–60 % khối lượng, giữ cường độ | Bosquet 2007 [17] |
| Cuộc đua thử | HM trước marathon (10K trước bán marathon), cách 6 tuần, trong một tuần nhẹ | thực hành; kết quả dùng để hiệu chỉnh lại |

**Giáo án ít công sức nhất.** Trong số các giáo án có mọi tham số nằm trong vùng an toàn và sáng ngày đua
nằm trong dải độ tươi, chọn giáo án có ít tổng số km nhất mà dự báo vẫn đạt mục tiêu (hoà thì: ít buổi
chất lượng hơn, tuần lớn nhất thấp hơn). Với mỗi tổ hợp các tham số còn lại, tìm kiếm nhị phân trên tuần
lớn nhất để tìm giá trị nhỏ nhất vẫn đạt mục tiêu. Nếu không có giáo án nào đạt, dùng giáo án an toàn
nhanh nhất và thời gian của nó trở thành mục tiêu làm việc. **Biên công sức (effort frontier)**: giáo án
an toàn nhanh nhất cho mỗi lượng chạy (biên Pareto theo tổng km và dự báo), khoảng 1,300 giáo án ứng viên,
mỗi giáo án 0.76 ms.

### 3.8 Kiểm tra triển khai

Bản xem trước của trình lập kế hoạch (Python) và dự báo của giáo án đã lưu (SQL) được so sánh trên một
bản sao cơ sở dữ liệu với nhiều giáo án: thời gian, dáng marathon, thể lực đua và độ tươi khớp chính xác.
Một người chạy tổng hợp (synthetic runner) được sinh từ mô hình với ảnh hưởng nhiệt đã biết là 0.7 %/°C,
khi ước lượng lại cho kết quả 0.82 %/°C.

## 4. Kết quả

### 4.1 Độ chính xác dự báo (9 cuộc đua, mỗi cuộc chỉ dự báo từ dữ liệu trước đó)

| Phương pháp | Sai số tuyệt đối TB | Độ lệch | Số cuộc đua |
|---|---|---|---|
| Daniels trên VO2max hiệu dụng × dáng marathon, đã hiệu chỉnh | **3.7 %** | −3.0 % | 8 |
| **Mô hình nhân quả (như trên + nhiệt), đã hiệu chỉnh** — dự báo dùng thực tế | **4.0 %** | −2.7 % | 8 |
| Daniels trên VO2max hiệu dụng, đã hiệu chỉnh | 5.9 % | −1.0 % | 8 |
| Dự đoán của đồng hồ, đã hiệu chỉnh | 6.2 % | +3.4 % | 8 |
| Daniels trên VO2max hiệu dụng × dáng marathon | 6.7 % | −6.2 % | 9 |
| Riegel (1.06) từ cuộc đua trước [24] | 7.9 % | +3.8 % | 8 |
| Dự đoán của đồng hồ | 12.0 % | −12.0 % | 9 |
| Daniels trên VO2max hiệu dụng | 13.1 % | −13.1 % | 9 |
| Tanda, từ 8 tuần thực tế trước đó (chỉ marathon) [8] | 13.6 % | −13.6 % | 1 |

Độ lệch = trung bình của (dự đoán − thực tế)/thực tế; âm = quá nhanh. Các phương pháp đã hiệu chỉnh bao
gồm 8 cuộc đua vì cuộc đua đầu tiên không có cuộc đua nào trước đó để hiệu chỉnh.

### 4.2 Đóng góp của từng thành phần

- **Sức bền (dáng marathon).** Không có nó, Daniels nhanh hơn thực tế trung bình 13 %, và cuộc marathon mất
  nhiều thời gian hơn dự đoán 39 %. Có nó, SD của tỉ số thực tế/dự đoán giữa các cuộc đua giảm từ 0.092 xuống 0.041.
- **Hiệu chỉnh.** Ngay cả khi có hệ số dáng, người chạy vẫn chạy chậm hơn công thức 7.9 % (tỉ số 1.079,
  khoảng 0.995–1.128): một độ lệch cá nhân ổn định (hiệu quả chạy, cách phân phối tốc độ).
- **Nhiệt.** 0.55 % mỗi °C WBGT (−0.3 đến 1.1). Nó không cải thiện độ chính xác trên các cuộc đua quá khứ
  (4.0 % so với 3.7 %): bản thân VO2max hiệu dụng đã được đo trong cái nóng ~30 °C. Nó được giữ lại vì
  cuộc đua mục tiêu mát hơn lúc tập 5.7 °C, vượt quá mọi cuộc đua trước đây.
- **Đáp ứng của thể lực đua.** b = 0.110 VO2max mỗi điểm CTL (0.032–0.189, 148 cửa sổ). Sai số tuyệt đối
  trung bình của dự phóng 84 ngày là 2.73 điểm, so với 2.92 nếu giả định "không thay đổi": có thật nhưng
  khiêm tốn.

### 4.3 Ví dụ lập kế hoạch (Tokyo Marathon, còn 13 tuần)

| | Tổng quãng chạy | Tuần lớn nhất | Dự báo |
|---|---|---|---|
| Nếu đua ngay hôm nay | — | 48 km (hiện tại) | 5:04 |
| Ít chạy nhất trên biên | 525 km | 48 km | 4:44 |
| Giáo án an toàn nhanh nhất, tăng tải sớm (front-loaded) | 816 km | 75 km | 3:55 |
| Giáo án an toàn nhanh nhất, tăng tải dần (gradual) | 761 km | 75 km | 4:05 |
| **Đề xuất: ít công sức nhất mà vẫn đạt 3:59:59** (tăng tải sớm, tuần lớn nhất 64 km, +8 %/tuần) | 728 km | 64 km | 3:59:50 |

Chỉ cách tăng tải sớm mới đạt 3:59:59 một cách an toàn; phép tìm ít công sức nhất chọn giáo án nhỏ nhất làm
được điều đó. Các thời gian tính đến ngày 15/10/2026 và thay đổi khi có buổi chạy mới.

## 5. Thảo luận

**Cấu trúc từ y văn, độ lớn từ người chạy.** Các công thức quần thể (Daniels, Runalyze) mang phần lớn tín
hiệu; một hệ số hiệu chỉnh nhân duy nhất loại bỏ phần lớn độ lệch của chúng với người chạy này. Tổ hợp
cho kết quả tốt nhất cũng chính là tổ hợp có các thành phần hành động được.

**Tăng tải dần hay tăng tải sớm.** Công thức dáng marathon tính mọi km trong 26 tuần nên ưu ái khối lượng
sớm: cách tăng tải sớm cho dự đoán nhanh hơn khoảng 8–10 phút trong ví dụ. Bằng chứng về chấn thương đặt ra
các giới hạn mà cả hai cách đều tôn trọng (mức tăng hằng tuần dưới 20 % [21], không buổi chạy nào dài hơn
10 % so với buổi dài nhất gần đây [23]) nhưng không so sánh hai giáo án cùng nằm trong các giới hạn đó; lợi
thế của tăng tải dần là tổng quãng chạy ít hơn, một mức giảm phơi nhiễm hợp lý nhưng chưa được chứng minh.
Một bản nháp trước gọi tăng tải dần là "dựa trên bằng chứng"; điều đó đã nói quá các nghiên cứu. Giờ đây Ran
để người chạy lựa chọn và tìm trên cả hai cách.

**Ít công sức nhất làm mặc định.** Chọn số km ít nhất vẫn đạt mục tiêu tôn trọng thời gian và mức phơi
nhiễm chấn thương của người chạy, nhưng nó đạt mục tiêu theo dự báo điểm, nằm trong dải ±4 %. Nhắm tới một
khoảng an toàn là một lựa chọn thiết kế còn bỏ ngỏ.

### Hạn chế

1. **n = 1.** Một người chạy, chín cuộc đua, một marathon. Giá trị ngoại suy chưa được kiểm chứng.
2. **VO2max hiệu dụng** phụ thuộc vào nhịp tim, vốn trôi theo nhiệt, mức nước trong cơ thể và mệt mỏi.
3. **Các buổi chất lượng** chỉ ảnh hưởng đến thể lực đua qua tải tập luyện; không mô hình hoá tác động
   riêng của từng buổi, vì thiếu bằng chứng dùng được.
4. **Độ tươi** là một thành phần bậc thang thô; nó đánh giá thấp giảm tải, nên độ dài giảm tải bị giới
   hạn trong các mức của bằng chứng.
5. **Cách thực hiện** (phân phối tốc độ, tiếp năng lượng) chỉ được tư vấn, không được mô hình hoá, dù nó
   ảnh hưởng đáng kể đến kết quả [25].
6. **Chọn mẫu**: các cuộc đua do người chạy tự đánh dấu; cuộc đua thử và cuộc đua mục tiêu có thể được
   phân phối tốc độ khác nhau.

## 6. Hướng phát triển

Một người chạy thứ hai và một bộ dữ liệu công khai; một thử nghiệm tiến cứu với giáo án được đề xuất; mô
hình tác động riêng của các buổi chất lượng; một thành phần độ tươi liên tục; sức bền có trọng số theo sự
đều đặn; đẩy các buổi tập theo kế hoạch lên đồng hồ khi người chạy đồng ý.

## Tài liệu tham khảo

1. Joyner MJ, Coyle EF. Endurance exercise performance: the physiology of champions. J Physiol 2008. [summary](https://www.sciencedaily.com/releases/2008/07/080731173157.htm) · [review of determinants (Frontiers 2021)](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2021.719434/pdf)
2. VO2max, threshold and economy as predictors. [overview](https://marathonhandbook.com/vo%E2%82%82-max-threshold-or-economy-what-actually-predicts-endurance-performance/)
3. Hunter B, Muniz-Pumares D, et al. Durability of parameters associated with endurance running. Eur J Sport Sci 2025. [pdf](https://uhra.herts.ac.uk/id/eprint/26353/1/European_Journal_of_Sport_Science_-_2025_-_Hunter_-_Durability_of_Parameters_Associated_With_Endurance_Running_in.pdf) · [durability review (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11889008)
4. Cardiac decoupling and marathon performance in 82,000 runners. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/9388405)
5. Morton RH, Fitz-Clarke JR, Banister EW. Modeling human performance in running. J Appl Physiol 1990. [PubMed](https://pubmed.ncbi.nlm.nih.gov/2246166/) · [training-load methods](https://opus.lib.uts.edu.au/handle/10453/122356)
6. Ely MR, et al. Impact of weather on marathon-running performance. Med Sci Sports Exerc 2007. [link](https://experts.umn.edu/en/publications/impact-of-weather-on-marathon-running-performance/)
7. Impellizzeri FM, et al. Acute:chronic workload ratio: conceptual issues. 2020. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7534938/)
8. Tanda G, Knechtle B. Marathon performance in relation to body fat percentage and training indices. 2013. [link](https://www.dovepress.com/marathon-performance-in-relation-to-body-fat-percentage-and-training-i-peer-reviewed-fulltext-article-OAJSM)
9. Vickers AJ, Vertosick EA. An empirical study of race times in recreational endurance runners. 2016. [link](https://synapse.mskcc.org/synapse/works/101585)
10. Bonet JB, et al. Individual responses to high-intensity interval training. 2020. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7642248)
11. Rosenblat MA, et al. Polarized vs threshold training intensity distribution. 2019. [PubMed](https://pubmed.ncbi.nlm.nih.gov/29863593/) · Oliveira 2024 meta-analysis [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11329428)
12. Llanos-Lagos C, et al. Strength training and running economy. 2024. [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11052887/)
13. Effects of tapering on performance in endurance athletes (meta-analysis). PLOS ONE 2023. [pdf](https://www.fisiologiadelejercicio.com/wp-content/uploads/2023/05/Effects-of-tapering-on-performance-in-endurance-athletes.pdf)
14. Daniels J, Gilbert J. Oxygen Power: performance tables for distance runners. 1979. *(Sách; phương trình theo cách đã triển khai, chưa đối chiếu lại với bản gốc cho bản nháp này.)*
15. Runalyze. VO2max prognosis with marathon-shape adjustment (source code). [GitHub](https://github.com/Runalyze/Runalyze/blob/support/4.3.x/inc/core/Sports/Running/Prognosis/VO2max.php) · [marathon shape (help)](https://runalyze.com/help/article/88)
16. Allen H, Coggan A. Training and Racing with a Power Meter. *(Sách; mục tiêu phong độ theo cách thường được trích dẫn.)*
17. Bosquet L, Montpetit J, Arvisais D, Mujika I. Effects of tapering on performance: a meta-analysis. Med Sci Sports Exerc 2007. *(Chưa mở lại cho bản nháp này.)*
18. Mujika I, Padilla S. Scientific bases for precompetition tapering strategies. Med Sci Sports Exerc 2003. *(Chưa mở lại cho bản nháp này.)*
19. Open-Meteo historical weather API (ERA5). [open-meteo.com](https://open-meteo.com/)
20. Australian Bureau of Meteorology. Approximation of WBGT from temperature and humidity. *(Công thức theo cách đã triển khai.)*
21. Damsted C, et al. ProjectRun21: weekly running distance progression and injury in half-marathon preparation. JOSPT 2019;49(4):230–238. [link](https://researchportal.lih.lu/en/publications/the-association-between-changes-in-weekly-running-distance-and-ru/)
22. Nielsen RO, et al. Excessive progression in weekly running distance and risk of running-related injuries. JOSPT 2014. [link](https://vbn.aau.dk/da/publications/excessive-progression-in-weekly-running-distance-and-risk-of-runn)
23. Frandsen JSB, et al. How much running is too much? Identifying high-risk running sessions in a 5200-person cohort. Br J Sports Med 2025;59:1203–1210. [link](https://researchportal.lih.lu/en/publications/how-much-running-is-too-much-identifying-high-risk-running-sessio/)
24. Riegel PS. Athletic records and human endurance. American Scientist 1981. *(Chương sách / bài báo; số mũ 1.06 theo cách thường dùng.)*
25. Smyth B. How recreational marathon runners hit the wall. PLOS ONE 2021. [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8133477/)
26. An evaluation of the training determinants of marathon performance: a meta-analysis with meta-regression. J Sci Med Sport 2020;23(2):182–188. [PubMed](https://pubmed.ncbi.nlm.nih.gov/31704026/)
27. Fokkema T, et al. Training for a (half-)marathon: training volume and longest endurance run related to performance and injuries. Scand J Med Sci Sports 2020. [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7496388/)
