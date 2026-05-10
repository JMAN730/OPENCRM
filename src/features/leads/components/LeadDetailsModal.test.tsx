import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LeadDetailsModal } from './LeadDetailsModal'
import { trpc } from '@/app/_trpc/client'

// Mock tRPC
vi.mock('@/app/_trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      leads: {
        getAll: {
          invalidate: vi.fn(),
        },
      },
    }),
    leads: {
      updateCallOutcome: {
        useMutation: vi.fn(() => ({
          mutate: vi.fn(),
          isPending: false,
        })),
      },
    },
  },
}))

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('LeadDetailsModal', () => {
  const mockLead = {
    id: '1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '555-1234',
    company: 'Acme Corp',
    website: 'acme.com',
    status: 'NEW',
    source: 'Website',
    callOutcome: 'NOT_CONTACTED',
    callNotes: '',
    createdAt: new Date().toISOString(),
  }

  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the component', () => {
    const { container } = render(
      <LeadDetailsModal
        lead={mockLead}
        isOpen={true}
        onClose={mockOnClose}
      />
    )

    expect(container).toBeInTheDocument()
  })

  it('renders call outcome select element with correct options', () => {
    render(
      <LeadDetailsModal
        lead={mockLead}
        isOpen={true}
        onClose={mockOnClose}
      />
    )

    const selects = document.querySelectorAll('select')
    expect(selects.length).toBeGreaterThan(0)
    const callOutcomeSelect = selects[0]
    const options = callOutcomeSelect.querySelectorAll('option')
    expect(options.length).toBe(5) // 5 call outcome options
  })

  it('allows changing call outcome', () => {
    render(
      <LeadDetailsModal
        lead={mockLead}
        isOpen={true}
        onClose={mockOnClose}
      />
    )

    const selects = document.querySelectorAll('select')
    const select = selects[0] as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'ANSWERED' } })
    expect(select.value).toBe('ANSWERED')
  })

  it('renders notes textarea', () => {
    render(
      <LeadDetailsModal
        lead={mockLead}
        isOpen={true}
        onClose={mockOnClose}
      />
    )

    const textarea = screen.getByPlaceholderText('Add any notes about this call...')
    expect(textarea).toBeInTheDocument()
  })

  it('allows updating notes', () => {
    render(
      <LeadDetailsModal
        lead={mockLead}
        isOpen={true}
        onClose={mockOnClose}
      />
    )

    const textarea = screen.getByPlaceholderText('Add any notes about this call...')
    fireEvent.change(textarea, { target: { value: 'Called and left voicemail' } })
    expect((textarea as HTMLTextAreaElement).value).toBe('Called and left voicemail')
  })


  it('preloads existing call outcome', () => {
    const leadWithOutcome = {
      ...mockLead,
      callOutcome: 'ANSWERED',
      callNotes: 'Customer was interested',
    }

    render(
      <LeadDetailsModal
        lead={leadWithOutcome}
        isOpen={true}
        onClose={mockOnClose}
      />
    )

    const selects = document.querySelectorAll('select')
    const select = selects[0] as HTMLSelectElement
    expect(select.value).toBe('ANSWERED')
  })

  it('preloads existing notes', () => {
    const leadWithOutcome = {
      ...mockLead,
      callOutcome: 'ANSWERED',
      callNotes: 'Customer was interested',
    }

    render(
      <LeadDetailsModal
        lead={leadWithOutcome}
        isOpen={true}
        onClose={mockOnClose}
      />
    )

    const textarea = screen.getByDisplayValue('Customer was interested')
    expect(textarea).toBeInTheDocument()
  })
})
