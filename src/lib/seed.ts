import type { Category, Drop, Repeat, Status } from './types'
import { toISO } from './format'

/**
 * An optional demo vault, rebuilt on dates relative to whenever it is loaded.
 * It is never planted automatically — a new install starts empty, as it should.
 * The user asks for this from the Home empty state or Help & Support, and every
 * row is tagged `sample` so removing it cannot touch anything real.
 */

interface Seed {
  id: string
  title: string
  merchant: string
  amount: number | null
  category: Category
  offset: number
  time?: string
  status: Status
  repeat: Repeat
  remind: number | null
  reference: string
  fileName: string
  needsReview?: boolean
  notes?: string
}

const SEEDS: Seed[] = [
  { id: 'globe', title: 'Internet Bill', merchant: 'Globe Fiber', amount: 1899, category: 'bill', offset: 1, status: 'unpaid', repeat: 'monthly', remind: 2, reference: 'Account ending 4421', fileName: 'IMG_4821.PNG', notes: 'Plan 1899 · unlimited' },
  { id: 'meralco', title: 'Electricity Bill', merchant: 'Meralco', amount: 3420, category: 'bill', offset: 3, status: 'unpaid', repeat: 'monthly', remind: 3, reference: 'Customer no. 9021-4417', fileName: 'meralco-sep.pdf' },
  { id: 'netflix', title: 'Netflix', merchant: 'Netflix · Standard', amount: 549, category: 'subscription', offset: 4, status: 'active', repeat: 'monthly', remind: 1, reference: 'Card ending 8812', fileName: 'netflix-email.png' },
  { id: 'cebpac', title: 'Cebu Pacific Flight', merchant: 'MNL → CEB · 5J 561', amount: null, category: 'booking', offset: 6, time: '08:20', status: 'confirmed', repeat: 'none', remind: 1, reference: 'Booking ref. QK7T2M', fileName: 'booking-confirmation.pdf' },
  { id: 'nike', title: 'Nike Receipt', merchant: 'Nike Park BGC', amount: 4295, category: 'receipt', offset: -3, status: 'saved', repeat: 'none', remind: null, reference: 'Ref. 0091-2284', fileName: 'IMG_4790.PNG', needsReview: true },
  { id: 'mercury', title: 'Mercury Drug', merchant: 'Receipt · Ayala Malls', amount: 842.35, category: 'receipt', offset: -4, status: 'saved', repeat: 'none', remind: null, reference: 'Ref. 7741-0093', fileName: 'IMG_4788.PNG' },
  { id: 'grab', title: 'Grab Receipt', merchant: 'BGC → Ortigas', amount: 318, category: 'receipt', offset: -5, status: 'saved', repeat: 'none', remind: null, reference: 'Trip ID 88-2201', fileName: 'grab-receipt.png', needsReview: true },
  { id: 'pal', title: 'Philippine Airlines', merchant: 'MNL → SIN · PR 507', amount: null, category: 'booking', offset: 54, time: '07:40', status: 'confirmed', repeat: 'none', remind: 1, reference: 'Booking ref. LM94QP', fileName: 'pal-itinerary.pdf' },
  { id: 'airfryer', title: 'Air Fryer Warranty', merchant: 'Kyowa', amount: null, category: 'warranty', offset: 480, status: 'active', repeat: 'none', remind: 30, reference: 'Serial KY-4471-A', fileName: 'warranty-card.jpg', notes: 'Purchased Jan 12' },
  { id: 'passport', title: 'Passport', merchant: 'DFA Manila', amount: null, category: 'document', offset: 1730, status: 'valid', repeat: 'none', remind: 90, reference: 'P-series · ends 4402', fileName: 'passport-scan.pdf' },
  { id: 'dentist', title: 'Dentist Appointment', merchant: 'Dr. Reyes · Makati Dental', amount: null, category: 'event', offset: 0, time: '15:30', status: 'confirmed', repeat: 'semiannual', remind: 1, reference: 'Clinic 8F, Unit 803', fileName: 'appointment-sms.png' },
  { id: 'ptm', title: 'Parent-Teacher Meeting', merchant: 'St. Scholastica · Grade 4', amount: null, category: 'event', offset: 5, time: '17:00', status: 'confirmed', repeat: 'none', remind: 1, reference: 'Room 204', fileName: 'school-announcement.png', needsReview: true },
  { id: 'spotify', title: 'Spotify Premium', merchant: 'Subscription · Duo', amount: 194, category: 'subscription', offset: 11, status: 'active', repeat: 'monthly', remind: 1, reference: 'Card ending 8812', fileName: 'spotify-receipt.png' },
  { id: 'icloud', title: 'iCloud+ 200GB', merchant: 'Subscription', amount: 149, category: 'subscription', offset: 15, status: 'active', repeat: 'monthly', remind: null, reference: 'Apple ID a.santos', fileName: 'icloud-receipt.png' },
  { id: 'canva', title: 'Canva Pro', merchant: 'Subscription · Annual', amount: 550, category: 'subscription', offset: 25, status: 'active', repeat: 'monthly', remind: 3, reference: 'Card ending 8812', fileName: 'canva-invoice.pdf' },
  { id: 'maynilad', title: 'Water Bill', merchant: 'Maynilad', amount: 748.5, category: 'bill', offset: -12, status: 'paid', repeat: 'monthly', remind: 3, reference: 'Contract no. 55-2210', fileName: 'maynilad-aug.pdf' },
  { id: 'jollibee', title: 'Jollibee', merchant: 'Receipt · Glorietta', amount: 465, category: 'receipt', offset: -8, status: 'saved', repeat: 'none', remind: null, reference: 'Ref. 2204-8891', fileName: 'IMG_4762.PNG' },
  { id: 'landers', title: 'Landers Superstore', merchant: 'Receipt · Arcovia', amount: 3187.4, category: 'receipt', offset: -10, status: 'saved', repeat: 'none', remind: null, reference: 'Ref. 9930-1174', fileName: 'IMG_4750.PNG' },
]

function plusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return toISO(d)
}

export function buildSeedDrops(): Drop[] {
  const now = Date.now()
  return SEEDS.map((s, i) => {
    const created = now - (i + 1) * 3_600_000
    return {
      id: s.id,
      title: s.title,
      merchant: s.merchant,
      amount: s.amount,
      category: s.category,
      date: plusDays(s.offset),
      time: s.time ?? null,
      status: s.status,
      repeat: s.repeat,
      remindDaysBefore: s.remind,
      reference: s.reference,
      notes: s.notes ?? '',
      fileName: s.fileName,
      imageId: null,
      needsReview: s.needsReview ?? false,
      archived: false,
      createdAt: created,
      updatedAt: created,
      sample: true,
      history: [
        { label: 'Dropped from a screenshot', at: created, tone: 'primary' },
        { label: 'Details extracted by LifeDrop AI', at: created + 2000, tone: 'accent' },
        { label: 'Saved to Inbox and Vault', at: created + 3000, tone: 'border' },
      ],
    } satisfies Drop
  })
}
