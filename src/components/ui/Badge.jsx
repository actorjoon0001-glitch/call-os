const variants = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  gray: 'bg-gray-50 text-gray-700 border-gray-200',
  primary: 'bg-primary-light text-primary-dark border-blue-200',
}

const statusMap = {
  '신규': 'info',
  '상담중': 'warning',
  '계약': 'success',
  '보류': 'gray',
  'answered': 'success',
  'missed': 'danger',
  'ringing': 'warning',
  'failed': 'danger',
  'voicemail': 'gray',
  // 방문예약 상태
  '요청': 'warning',
  '확정': 'success',
  '취소': 'danger',
  '방문완료': 'info',
  '노쇼': 'gray',
  // AI 세션 결과
  'booked': 'success',
  'transferred': 'info',
  'ended': 'gray',
  'in_progress': 'warning',
}

export default function Badge({ children, variant, className = '' }) {
  const v = variant || statusMap[children] || 'gray'
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[v]} ${className}`}
    >
      {children}
    </span>
  )
}
