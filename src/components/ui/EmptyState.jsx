import { Inbox } from 'lucide-react'

export default function EmptyState({ message = '데이터가 없습니다.', icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <Icon size={48} strokeWidth={1} />
      <p className="mt-3 text-sm">{message}</p>
    </div>
  )
}
