# ระบบรายงานการทำงานล่วงเวลา (Overtime Report Web Dashboard)

ระบบ Web Dashboard & รายงานสรุปการทำงานล่วงเวลา (Overtime) จากฐานข้อมูล Microsoft SQL Server (`BPKN3\SQLEXPRESS` / `10.5.3.3`) ฐานข้อมูล `hrmbhsql` ตาราง `[dbo].[Overtime]` และ `[dbo].[Overtimedetail]`

---

## ฟังก์ชันการทำงานหลัก (Core Features)

1. **เลือกช่วงวันที่จะดูรายงาน (Date Range Picker)**
   - กำหนดวันที่เริ่มต้น (Start Date) และวันที่สิ้นสุด (End Date)
   - ปุ่มลัดช่วงเวลาด่วน: วันนี้, เมื่อวาน, 7 วันล่าสุด, เดือนนี้, เดือนที่แล้ว
   - ดึงข้อมูลเอกสาร OT ล่าสุดแบบอัตโนมัติ

2. **เลือก Checkbox Ref No ที่ใช้ในรายงาน (Ref No Multi-Selection)**
   - แสดงรายการเลขที่เอกสาร OT (`refno`) ทั้งหมดในช่วงวันที่เลือก พร้อมระบุวันที่ แผนก และจำนวนพนักงาน
   - ระบบ Checkbox ให้เลือก/ไม่เลือก refno ตามต้องการ
   - ปุ่ม "เลือกทั้งหมด" (Select All) และ "ยกเลิกทั้งหมด" (Deselect All)
   - ช่องค้นหาด่วน (Live Search) ตาม Ref No, แผนก, หรือส่วนงาน

3. **รายงานสรุปรายวัน แยกตามแผนก (DEPT) และจำนวนคน (Headcount Summary)**
   - **ตารางสรุปรายวัน (Daily Department Summary):** แสดงวันที่, แผนก (`dept`), จำนวนคน (`emp_count`), จำนวนใบเอกสาร, รายการ Ref No, ชั่วโมงรวม และปุ่มดูรายชื่อ
   - **ตาราง Matrix (วันที่ x แผนก):** แสดงเป็นตารางไขว้ (Cross-Tab) แนวนอนเป็นแผนก แนวตั้งเป็นวันที่ พร้อมจำนวนคนในแต่ละช่อง และยอดรวมตามแผนก/ตามวัน
   - **แผนภูมิวิเคราะห์ (Charts):** กราฟแท่งเปรียบเทียบจำนวนคนแยกตามแผนก และกราฟเส้นแสดงแนวโน้ม OT รายวัน
   - **ดูรายชื่อพนักงาน (Drilldown Modal):** คลิกดูรหัสพนักงาน, ชื่อ-นามสกุล, ลักษณะงาน, เวลาเข้า-ออก, ชม. OT และจุดขึ้นรถ
   - **ส่งออก Excel (CSV Export):** รองรับ UTF-8 BOM เปิดใน MS Excel ภาษาไทยได้ทันทีไม่เพี้ยน
   - **พิมพ์รายงาน (Print View):** จัดหน้ากระดาษพร้อมสั่งพิมพ์หรือบันทึกเป็น PDF

---

## การเชื่อมต่อฐานข้อมูล (Database Configuration)

- **SQL Server Instance:** `BPKN3\SQLEXPRESS` (`10.5.3.3:1433`)
- **Database:** `hrmbhsql`
- **Tables:**
  - `[dbo].[Overtime]` (Header: refno, date_, dept, section, company, tot_hr, etc.)
  - `[dbo].[Overtimedetail]` (Detail: refno, empcode, fullname, workdesc, timein, timeout, tot_hr, ot1, ot2, ot3, busplace)

---

## การเริ่มต้นใช้งาน (Quick Start)

### 1. ติดตั้ง Dependencies (หากรันครั้งแรก)
```bash
pip install -r requirements.txt
```

### 2. สั่งเริ่มและหยุดระบบ
```bash
# เริ่มระบบ (Port 5030)
./start.sh

# หยุดระบบ
./stop.sh
```

### 3. เข้าใช้งานผ่าน Web Browser
เปิด URL:
```
http://localhost:5030
หรือ
http://<SERVER_IP>:5030
```

---

## Reference SQL Query

```sql
SELECT TOP (1000) 
       A.[refno]
      ,A.[date_]
      ,A.[org_no]
      ,A.[section]
      ,A.[dept]
      ,A.[div]
      ,A.[company]
      ,A.[timein]
      ,A.[timeout]
      ,A.[tot_hr]
      ,A.[username]
      ,A.[createdate]
      ,A.[editname]
      ,A.[editdate]
      ,A.[approved]
      ,A.[ot0]
      ,A.[ot1]
      ,A.[ot2]
      ,A.[ot3]
      ,A.[refdate]
      ,A.[appvstatus]
      ,B.[Id]
      ,B.[refno]
      ,B.[item]
      ,B.[empcode]
      ,B.[fullname]
      ,B.[workdesc]
      ,B.[timein]
      ,B.[timeout]
      ,B.[tot_hr]
      ,B.[ot0]
      ,B.[ot1]
      ,B.[ot2]
      ,B.[ot3]
      ,B.[freezed]
      ,B.[bus]
      ,B.[ot_done]
      ,B.[emp_type]
  FROM [hrmbhsql].[dbo].[Overtime] A WITH (NOLOCK)
  LEFT JOIN [dbo].[Overtimedetail] B WITH (NOLOCK)
  ON A.refno = B.refno
  WHERE A.date_ BETWEEN '20261001' AND '20261026'
  ORDER BY A.refno
```
