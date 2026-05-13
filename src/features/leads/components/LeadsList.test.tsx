import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { LeadsList } from './LeadsList'
import { trpc } from '@/app/_trpc/client'

// The component uses useSession() at module load. Mock it so tests don't
// need a <SessionProvider /> wrapper.
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({
    data: {
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'Test User',
        role: 'ADMIN',
        organizationId: 'org-1',
        teamId: null,
      },
      expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    },
    status: 'authenticated',
  })),
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

// Mock tRPC. LeadsList now uses useInfiniteQuery for cursor pagination
// (one page = 50 leads), so the mock returns the multi-page shape.
vi.mock('@/app/_trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      leads: {
        getAll: { invalidate: vi.fn() },
        getNotes: { invalidate: vi.fn() },
      },
    }),
    leads: {
      getAll: {
        useInfiniteQuery: vi.fn(),
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
      organizationMembers: {
        useQuery: vi.fn(() => ({ data: [] })),
      },
    },
  },
}))

describe('LeadsList', () => {
  it('shows loading state initially', () => {
    (trpc.leads.getAll.useInfiniteQuery as any).mockReturnValue({
      data: undefined,
      isLoading: true,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    });

    render(<LeadsList />)
    // The component renders a Unicode ellipsis (…), not three dots — keep
    // the matcher tolerant so future copy changes don't silently break.
    expect(screen.getByText(/Loading leads/i)).toBeInTheDocument()
  })

  it('renders leads from the first infinite-query page', () => {
    (trpc.leads.getAll.useInfiniteQuery as any).mockReturnValue({
      data: {
        pages: [
          {
            items: [
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
            nextCursor: null,
          },
        ],
        pageParams: [],
      },
      isLoading: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    });

    render(<LeadsList />)
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  it('flattens multiple pages into a single rendered list', () => {
    (trpc.leads.getAll.useInfiniteQuery as any).mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                id: '1',
                firstName: 'Page1',
                lastName: 'Lead',
                status: 'NOT_CONTACTED',
                company: 'A',
                callOutcome: 'NOT_CONTACTED',
                createdAt: new Date().toISOString(),
              },
            ],
            nextCursor: 'cursor-1',
          },
          {
            items: [
              {
                id: '2',
                firstName: 'Page2',
                lastName: 'Lead',
                status: 'NOT_CONTACTED',
                company: 'B',
                callOutcome: 'NOT_CONTACTED',
                createdAt: new Date().toISOString(),
              },
            ],
            nextCursor: null,
          },
        ],
        pageParams: [undefined, 'cursor-1'],
      },
      isLoading: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    });

    render(<LeadsList />)
    expect(screen.getByText('Page1 Lead')).toBeInTheDocument()
    expect(screen.getByText('Page2 Lead')).toBeInTheDocument()
  })

  it('shows a Load more affordance when more pages are available', () => {
    (trpc.leads.getAll.useInfiniteQuery as any).mockReturnValue({
      data: {
        pages: [{ items: [], nextCursor: null }],
        pageParams: [],
      },
      isLoading: false,
      hasNextPage: true,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    });

    render(<LeadsList />)
    expect(screen.getByRole('button', { name: /Load more/i })).toBeInTheDocument()
  })
})
