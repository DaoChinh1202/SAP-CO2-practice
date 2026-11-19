# SAP-C02 Offline

Ứng dụng web vanilla HTML/CSS/JS để luyện tập và thi thử SAP-C02 bằng tiếng Việt. Ứng dụng chạy offline sau khi máy chủ đã phục vụ các tệp dữ liệu, không có build system hoặc dependency bên ngoài.

## Chạy

Từ thư mục này:

```bash
python3 -m http.server 8000
```

Mở <http://localhost:8000/> trong trình duyệt. Không mở trực tiếp bằng `file://` vì trình duyệt sẽ chặn `fetch()` dữ liệu JSON.

## Tính năng

- Trang chủ với tổng số câu, chọn bộ đề, số lượng câu và xáo trộn.
- Luyện tập: kiểm tra lựa chọn, đáp án đúng và giải thích bằng tiếng Việt.
- Thi thử: không tiết lộ đáp án trước khi nộp, đánh dấu xem lại và hộp thoại xác nhận.
- Kết quả sau thi có tổng hợp điểm và danh sách ôn lại.
- Điều hướng câu hỏi, phím `1–6` chọn đáp án, phím mũi tên chuyển câu, phím `M` đánh dấu trong thi thử.
- Tự động lưu phiên đang làm trong `localStorage`, chuyển giao diện sáng/tối và điều hướng mobile.
- Ngân hàng câu hỏi có tìm kiếm/lọc nhưng không hiển thị trường đáp án hoặc giải thích.
- Câu có `correctAnswers` rỗng được hiển thị là chưa có đáp án chuẩn và không được tính đúng.

## Dữ liệu

`data/catalog.json` là danh mục nguồn. Mỗi `id` trong danh mục được tải từ `data/<id>.json`. Có thể thay thế hoặc bổ sung các bản ghi theo schema hiện có (`question`, `options`, `requiredAnswers`, `correctAnswers`, `explanation`, `reviewNote`).
