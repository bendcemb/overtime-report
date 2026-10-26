import logging
import pymssql
from datetime import datetime, date
from decimal import Decimal
from config import Config

logger = logging.getLogger(__name__)

def get_db_connection():
    """Establish connection to SQL Server (BPKN3\\SQLEXPRESS) with UTF-8 charset."""
    return pymssql.connect(
        server=Config.DB_SERVER,
        port=Config.DB_PORT,
        user=Config.DB_USER,
        password=Config.DB_PASSWORD,
        database=Config.DB_DATABASE,
        login_timeout=8,
        timeout=15,
        charset='UTF-8'
    )

def serialize_val(val):
    """Serialize row fields into JSON-serializable types."""
    if isinstance(val, (datetime, date)):
        return val.strftime('%Y-%m-%d')
    elif isinstance(val, Decimal):
        return float(val)
    elif isinstance(val, bytes):
        return val.decode('utf-8', errors='ignore')
    return val

def get_latest_dates():
    """Get the latest recorded date in Overtime table to provide smart defaults."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(as_dict=True)
        cursor.execute("""
            SELECT TOP 1 CONVERT(VARCHAR(10), date_, 120) AS latest_date
            FROM [dbo].[Overtime] WITH (NOLOCK)
            ORDER BY date_ DESC
        """)
        row = cursor.fetchone()
        if row and row.get('latest_date'):
            return row['latest_date']
        return datetime.today().strftime('%Y-%m-%d')
    except Exception as e:
        logger.error("Error fetching latest date: %s", e)
        return datetime.today().strftime('%Y-%m-%d')
    finally:
        if conn:
            conn.close()

def get_refnos_by_date_range(start_date, end_date):
    """
    Fetch all Overtime refno records within the date range [start_date, end_date].
    Includes department, section, total hours, and count of employees in each refno.
    """
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(as_dict=True)
        
        # 1. Query Overtime header records within date range
        cursor.execute("""
            SELECT 
                A.refno,
                CONVERT(VARCHAR(10), A.date_, 120) AS date_str,
                ISNULL(A.dept, 'ไม่ระบุ') AS dept,
                ISNULL(A.section, '-') AS section,
                ISNULL(A.company, '-') AS company,
                ISNULL(A.workdesc, '-') AS workdesc,
                ISNULL(A.timein, 0) AS timein,
                ISNULL(A.timeout, 0) AS timeout,
                ISNULL(A.tot_hr, 0) AS tot_hr
            FROM [dbo].[Overtime] A WITH (NOLOCK)
            WHERE A.date_ >= %s AND A.date_ <= %s
            ORDER BY A.date_ DESC, A.dept ASC, A.refno ASC
        """, (start_date, end_date))
        
        refno_rows = cursor.fetchall()
        if not refno_rows:
            return []
            
        refno_list = [r['refno'] for r in refno_rows]
        
        # 2. Efficiently count employees per refno in batches of up to 1000
        emp_counts = {}
        batch_size = 800
        for i in range(0, len(refno_list), batch_size):
            batch = refno_list[i:i + batch_size]
            placeholders = ','.join(['%s'] * len(batch))
            cursor.execute(f"""
                SELECT refno, COUNT(*) AS cnt, COUNT(DISTINCT empcode) AS distinct_cnt
                FROM [dbo].[Overtimedetail] WITH (NOLOCK)
                WHERE refno IN ({placeholders})
                GROUP BY refno
            """, tuple(batch))
            
            for row in cursor.fetchall():
                emp_counts[row['refno']] = {
                    'total_entries': row['cnt'],
                    'distinct_employees': row['distinct_cnt']
                }
        
        # Merge counts into result
        results = []
        for r in refno_rows:
            r_no = r['refno']
            c_info = emp_counts.get(r_no, {'total_entries': 0, 'distinct_employees': 0})
            results.append({
                'refno': r_no,
                'date': r['date_str'],
                'dept': r['dept'].strip() if r['dept'] else 'ไม่ระบุ',
                'section': r['section'].strip() if r['section'] else '-',
                'company': r['company'].strip() if r['company'] else '-',
                'workdesc': r['workdesc'].strip() if r['workdesc'] else '-',
                'tot_hr': float(r['tot_hr']) if r['tot_hr'] is not None else 0.0,
                'emp_count': c_info['distinct_employees'] or c_info['total_entries']
            })
            
        return results
    except Exception as e:
        logger.error("Error in get_refnos_by_date_range: %s", e)
        raise
    finally:
        if conn:
            conn.close()

def get_overtime_report_data(selected_refnos, start_date=None, end_date=None):
    """
    Fetch complete report data for selected refnos:
    - Grouped by Date and Department with employee count
    - Matrix breakdown of Date x Department
    - Detailed employee list for drilldown
    - Summary KPI statistics
    """
    if not selected_refnos:
        return {
            'summary_by_date_dept': [],
            'matrix': {'dates': [], 'departments': [], 'data': {}, 'totals_by_dept': {}, 'totals_by_date': {}},
            'stats': {'total_records': 0, 'total_distinct_workers': 0, 'total_hours': 0.0, 'date_count': 0, 'dept_count': 0, 'refno_count': 0},
            'details': []
        }
        
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(as_dict=True)
        
        all_details = []
        batch_size = 800
        
        for i in range(0, len(selected_refnos), batch_size):
            batch = selected_refnos[i:i + batch_size]
            placeholders = ','.join(['%s'] * len(batch))
            
            cursor.execute(f"""
                SELECT 
                    A.refno,
                    CONVERT(VARCHAR(10), A.date_, 120) AS date_str,
                    ISNULL(A.dept, 'ไม่ระบุ') AS dept,
                    ISNULL(A.section, '-') AS section,
                    ISNULL(A.company, '-') AS company,
                    ISNULL(A.workdesc, '-') AS header_workdesc,
                    ISNULL(A.tot_hr, 0) AS header_tot_hr,
                    B.Id,
                    B.item,
                    ISNULL(B.empcode, '-') AS empcode,
                    ISNULL(B.fullname, '-') AS fullname,
                    ISNULL(B.workdesc, '-') AS detail_workdesc,
                    ISNULL(B.timein, 0) AS timein,
                    ISNULL(B.timeout, 0) AS timeout,
                    ISNULL(B.tot_hr, 0) AS detail_tot_hr,
                    ISNULL(B.ot0, 0) AS ot0,
                    ISNULL(B.ot1, 0) AS ot1,
                    ISNULL(B.ot2, 0) AS ot2,
                    ISNULL(B.ot3, 0) AS ot3,
                    ISNULL(B.bus, 0) AS bus,
                    ISNULL(B.busplace, '-') AS busplace
                FROM [dbo].[Overtime] A WITH (NOLOCK)
                LEFT JOIN [dbo].[Overtimedetail] B WITH (NOLOCK) ON A.refno = B.refno
                WHERE A.refno IN ({placeholders})
                ORDER BY A.date_ ASC, A.dept ASC, A.refno ASC, B.item ASC
            """, tuple(batch))
            
            all_details.extend(cursor.fetchall())
            
        # Process and aggregate results in Python
        summary_map = {} # (date_str, dept) -> dict
        distinct_workers = set()
        all_dates = set()
        all_depts = set()
        clean_details = []
        total_hours_sum = 0.0

        for row in all_details:
            d_str = row['date_str']
            dept_name = (row['dept'] or 'ไม่ระบุ').strip()
            r_no = row['refno']
            emp_code = (row['empcode'] or '').strip()
            emp_name = (row['fullname'] or '').strip()
            
            tot_hr = float(row['detail_tot_hr'] or row['header_tot_hr'] or 0.0)
            total_hours_sum += tot_hr
            
            all_dates.add(d_str)
            all_depts.add(dept_name)
            if emp_code and emp_code != '-':
                distinct_workers.add(emp_code)
                
            key = (d_str, dept_name)
            if key not in summary_map:
                summary_map[key] = {
                    'date': d_str,
                    'dept': dept_name,
                    'refnos': set(),
                    'empcodes': set(),
                    'employees': [],
                    'total_hours': 0.0,
                    'ot1_sum': 0.0,
                    'ot2_sum': 0.0,
                    'ot3_sum': 0.0
                }
                
            summary_map[key]['refnos'].add(r_no)
            summary_map[key]['total_hours'] += tot_hr
            summary_map[key]['ot1_sum'] += float(row['ot1'] or 0.0)
            summary_map[key]['ot2_sum'] += float(row['ot2'] or 0.0)
            summary_map[key]['ot3_sum'] += float(row['ot3'] or 0.0)
            
            if emp_code and emp_code != '-':
                summary_map[key]['empcodes'].add(emp_code)
                
            emp_item = {
                'id': row['Id'],
                'refno': r_no,
                'date': d_str,
                'dept': dept_name,
                'section': (row['section'] or '-').strip(),
                'empcode': emp_code,
                'fullname': emp_name,
                'workdesc': (row['detail_workdesc'] or row['header_workdesc'] or '-').strip(),
                'timein': float(row['timein'] or 0.0),
                'timeout': float(row['timeout'] or 0.0),
                'tot_hr': tot_hr,
                'ot1': float(row['ot1'] or 0.0),
                'ot2': float(row['ot2'] or 0.0),
                'ot3': float(row['ot3'] or 0.0),
                'busplace': (row['busplace'] or '-').strip()
            }
            summary_map[key]['employees'].append(emp_item)
            clean_details.append(emp_item)
            
        # Transform summary_map to sorted list
        summary_list = []
        for (d_str, dept_name), val in sorted(summary_map.items(), key=lambda x: (x[0][0], x[0][1])):
            summary_list.append({
                'date': d_str,
                'dept': dept_name,
                'refnos': sorted(list(val['refnos'])),
                'refno_count': len(val['refnos']),
                'emp_count': len(val['empcodes']) if val['empcodes'] else len(val['employees']),
                'total_hours': round(val['total_hours'], 2),
                'ot1_sum': round(val['ot1_sum'], 2),
                'ot2_sum': round(val['ot2_sum'], 2),
                'ot3_sum': round(val['ot3_sum'], 2),
                'employees': val['employees']
            })
            
        # Build Matrix (Dates x Departments)
        sorted_dates = sorted(list(all_dates))
        sorted_depts = sorted(list(all_depts))
        
        matrix_data = {} # date -> dept -> {'emp_count': int, 'hours': float}
        totals_by_dept = {d: {'emp_count': 0, 'hours': 0.0} for d in sorted_depts}
        totals_by_date = {dt: {'emp_count': 0, 'hours': 0.0} for dt in sorted_dates}
        
        for item in summary_list:
            dt = item['date']
            dp = item['dept']
            if dt not in matrix_data:
                matrix_data[dt] = {}
            matrix_data[dt][dp] = {
                'emp_count': item['emp_count'],
                'hours': item['total_hours'],
                'refnos': item['refnos']
            }
            totals_by_dept[dp]['emp_count'] += item['emp_count']
            totals_by_dept[dp]['hours'] = round(totals_by_dept[dp]['hours'] + item['total_hours'], 2)
            totals_by_date[dt]['emp_count'] += item['emp_count']
            totals_by_date[dt]['hours'] = round(totals_by_date[dt]['hours'] + item['total_hours'], 2)
            
        stats = {
            'total_records': len(clean_details),
            'total_distinct_workers': len(distinct_workers),
            'total_hours': round(total_hours_sum, 2),
            'date_count': len(sorted_dates),
            'dept_count': len(sorted_depts),
            'refno_count': len(selected_refnos)
        }
        
        return {
            'summary_by_date_dept': summary_list,
            'matrix': {
                'dates': sorted_dates,
                'departments': sorted_depts,
                'data': matrix_data,
                'totals_by_dept': totals_by_dept,
                'totals_by_date': totals_by_date
            },
            'stats': stats,
            'details': clean_details
        }
    except Exception as e:
        logger.error("Error in get_overtime_report_data: %s", e)
        raise
    finally:
        if conn:
            conn.close()
