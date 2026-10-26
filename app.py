import os
import re
import csv
import io
import logging
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, Response
from werkzeug.middleware.proxy_fix import ProxyFix
from config import Config
from db import get_latest_dates, get_refnos_by_date_range, get_overtime_report_data

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = Config.SECRET_KEY

# Reverse Proxy Fix for Nginx subpath (/overtime-report)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# Security & CORS Headers
@app.after_request
def set_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
        "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; "
        "img-src 'self' data:; "
        "object-src 'none';"
    )
    return response

DATE_REGEX = re.compile(r'^\d{4}-\d{2}-\d{2}$')

def validate_date(date_str):
    if not date_str or not DATE_REGEX.match(date_str):
        return None
    try:
        return datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return None

@app.route('/')
def index():
    """Render main dashboard."""
    latest_str = get_latest_dates()
    latest_dt = validate_date(latest_str) or datetime.today().date()
    # Default to current month or past 7 days up to latest date
    start_dt = latest_dt.replace(day=1)
    
    return render_template(
        'index.html',
        default_start_date=start_dt.strftime('%Y-%m-%d'),
        default_end_date=latest_dt.strftime('%Y-%m-%d')
    )

@app.route('/api/refnos', methods=['GET'])
def api_get_refnos():
    """Fetch distinct refno list with metadata for given date range."""
    start_str = request.args.get('start_date', '').strip()
    end_str = request.args.get('end_date', '').strip()
    
    start_date = validate_date(start_str)
    end_date = validate_date(end_str)
    
    if not start_date or not end_date:
        return jsonify({'success': False, 'error': 'รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)'}), 400
        
    if start_date > end_date:
        return jsonify({'success': False, 'error': 'วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด'}), 400
        
    try:
        refnos = get_refnos_by_date_range(start_str, end_str)
        return jsonify({'success': True, 'count': len(refnos), 'data': refnos})
    except Exception as e:
        logger.error("Error fetching refnos: %s", e)
        return jsonify({'success': False, 'error': 'เกิดข้อผิดพลาดในการดึงข้อมูลเอกสาร OT'}), 500

@app.route('/api/report', methods=['POST'])
def api_get_report():
    """Generate overtime report for selected refnos."""
    payload = request.get_json(silent=True) or {}
    refnos = payload.get('refnos', [])
    
    if not isinstance(refnos, list):
        return jsonify({'success': False, 'error': 'รายการ refno ไม่ถูกต้อง'}), 400
        
    # Sanitize and limit refnos
    cleaned_refnos = [str(r).strip() for r in refnos if r and isinstance(r, str)]
    if len(cleaned_refnos) > 3000:
        cleaned_refnos = cleaned_refnos[:3000]
        
    if not cleaned_refnos:
        return jsonify({'success': False, 'error': 'กรุณาเลือก refno อย่างน้อย 1 รายการ'}), 400
        
    try:
        report_data = get_overtime_report_data(cleaned_refnos)
        return jsonify({'success': True, 'data': report_data})
    except Exception as e:
        logger.error("Error generating report: %s", e)
        return jsonify({'success': False, 'error': 'เกิดข้อผิดพลาดในการประมวลผลรายงาน OT'}), 500

@app.route('/api/export/csv', methods=['POST'])
def export_csv():
    """Export summary or detailed overtime report to CSV (UTF-8 BOM for MS Excel)."""
    payload = request.get_json(silent=True) or {}
    export_type = payload.get('type', 'summary') # 'summary' or 'detail' or 'matrix'
    refnos = payload.get('refnos', [])
    
    cleaned_refnos = [str(r).strip() for r in refnos if r and isinstance(r, str)]
    if not cleaned_refnos:
        return jsonify({'error': 'ไม่มีข้อมูลสำหรับส่งออก'}), 400
        
    try:
        report_data = get_overtime_report_data(cleaned_refnos)
        
        output = io.StringIO()
        # Write UTF-8 BOM
        output.write('\ufeff')
        writer = csv.writer(output)
        
        if export_type == 'summary':
            # Summary by Date & Department
            writer.writerow(['วันที่', 'แผนก (DEPT)', 'จำนวนคน (คน)', 'จำนวนเอกสาร (ใบ)', 'เอกสารอ้างอิง (Ref No)', 'ชม. รวม', 'OT 1.0 (ชม.)', 'OT 1.5 (ชม.)', 'OT 2.0 (ชม.)'])
            for row in report_data['summary_by_date_dept']:
                writer.writerow([
                    row['date'],
                    row['dept'],
                    row['emp_count'],
                    row['refno_count'],
                    ', '.join(row['refnos']),
                    row['total_hours'],
                    row['ot1_sum'],
                    row['ot2_sum'],
                    row['ot3_sum']
                ])
            filename = f"ot_summary_by_dept_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            
        elif export_type == 'matrix':
            # Matrix: Dates as Rows, Departments as Columns
            depts = report_data['matrix']['departments']
            writer.writerow(['วันที่'] + depts + ['รวมจำนวนคนทั้งหมด'])
            m_data = report_data['matrix']['data']
            totals_date = report_data['matrix']['totals_by_date']
            
            for dt in report_data['matrix']['dates']:
                row_vals = [dt]
                for dp in depts:
                    cell = m_data.get(dt, {}).get(dp, {})
                    cnt = cell.get('emp_count', 0)
                    row_vals.append(cnt if cnt > 0 else 0)
                row_vals.append(totals_date.get(dt, {}).get('emp_count', 0))
                writer.writerow(row_vals)
                
            # Grand totals row
            total_row = ['รวมทุกวัน']
            totals_dept = report_data['matrix']['totals_by_dept']
            grand_total = 0
            for dp in depts:
                c = totals_dept.get(dp, {}).get('emp_count', 0)
                total_row.append(c)
                grand_total += c
            total_row.append(grand_total)
            writer.writerow(total_row)
            filename = f"ot_dept_matrix_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            
        else:
            # Detailed Employee Records
            writer.writerow(['วันที่', 'เลขที่เอกสาร (Ref No)', 'แผนก (DEPT)', 'ฝ่าย/แผนกย่อย', 'รหัสพนักงาน', 'ชื่อ-นามสกุล', 'ลักษณะงาน', 'เวลาเข้า', 'เวลาออก', 'ชม. OT รวม', 'OT 1.0', 'OT 1.5', 'OT 2.0', 'จุดขึ้นรถ'])
            for d in report_data['details']:
                writer.writerow([
                    d['date'],
                    d['refno'],
                    d['dept'],
                    d['section'],
                    d['empcode'],
                    d['fullname'],
                    d['workdesc'],
                    d['timein'],
                    d['timeout'],
                    d['tot_hr'],
                    d['ot1'],
                    d['ot2'],
                    d['ot3'],
                    d['busplace']
                ])
            filename = f"ot_employees_detail_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            
        csv_bytes = output.getvalue().encode('utf-8')
        return Response(
            csv_bytes,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment;filename={filename}"}
        )
    except Exception as e:
        logger.error("Error exporting CSV: %s", e)
        return jsonify({'error': 'เกิดข้อผิดพลาดในการส่งออกไฟล์ CSV'}), 500

if __name__ == '__main__':
    # Local dev server
    app.run(host=Config.FLASK_HOST, port=Config.FLASK_PORT, debug=True)
