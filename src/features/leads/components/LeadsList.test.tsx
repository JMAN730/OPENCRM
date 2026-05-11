import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { LeadsList } from './LeadsList'
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
      getAll: {
        useQuery: vi.fn(),
      },
      create: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      delete: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      bulkCreate: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      updateCallOutcome: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      assign: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
    },
    teams: {
      myTeam: {
        useQuery: vi.fn(() => ({ data: null })),
      },
    },
  },
}))

describe('LeadsList', () => {
  it('shows loading state initially', () => {
    (trpc.leads.getAll.useQuery as any).mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    (trpc.leads.create.useMutation as any).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });

    render(<LeadsList />)
    expect(screen.getByText(/Loading leads.../i)).toBeInTheDocument()
  })

  it('renders leads when data is loaded', () => {
    (trpc.leads.getAll.useQuery as any).mockReturnValue({
      data: [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Doe',
          status: 'NOT_CONTACTED',
          company: 'Acme Corp',
          email: 'john@example.com',
          phone: '123456789',
          callOutcome: 'NOT_CONTACTED',
          createdAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
    });
    (trpc.leads.create.useMutation as any).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });

    render(<LeadsList />)
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })
})
