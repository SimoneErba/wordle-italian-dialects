import { ReactNode } from 'react'

interface ModalProps {
  title: string
  children: ReactNode
  onClose: () => void
  closeLabel?: string
  showCloseButton?: boolean
}

export function Modal({
  title,
  children,
  onClose,
  closeLabel = 'Close',
  showCloseButton = true,
}: ModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h3>{title}</h3>
          {showCloseButton ? (
            <button className="ghost-button" onClick={onClose} type="button">
              {closeLabel}
            </button>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  )
}
