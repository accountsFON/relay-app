/**
 * Five audit personas, all seated in the Relay Demo Agency Clerk org.
 *
 * The four DB only users (Sam, Jordan, Taylor, Dakota) cannot sign in on the
 * Clerk free dev tier (5 seat cap), so they are not personas. They surface in
 * Alex / Morgan / Riley views as data: AM kanban "two AM" scenario, designer
 * routing scenarios, three linked client portfolios.
 */

export type PersonaName = 'admin' | 'am' | 'designer' | 'client' | 'platform'

export interface Persona {
  name: PersonaName
  email: string
  password: string
  displayName: string
  role: 'admin' | 'account_manager' | 'designer' | 'client'
  platformOwner?: boolean
}

export const PERSONAS: Persona[] = [
  {
    name: 'admin',
    email: 'alex.admin@relaydemo.app',
    password: 'Password!123',
    displayName: 'Alex Brooks',
    role: 'admin',
  },
  {
    name: 'am',
    email: 'morgan.am@relaydemo.app',
    password: 'Password!123',
    displayName: 'Morgan Reyes',
    role: 'account_manager',
  },
  {
    name: 'designer',
    email: 'riley.designer@relaydemo.app',
    password: 'Password!123',
    displayName: 'Riley Chen',
    role: 'designer',
  },
  {
    name: 'client',
    email: 'casey.client@relaydemo.app',
    password: 'Password!123',
    displayName: 'Casey',
    role: 'client',
  },
  {
    name: 'platform',
    email: 'pat.platform@relaydemo.app',
    password: 'Password!123',
    displayName: 'Pat Owner',
    role: 'admin',
    platformOwner: true,
  },
]

export const personaByName = (name: PersonaName): Persona => {
  const found = PERSONAS.find((p) => p.name === name)
  if (!found) throw new Error(`Unknown persona: ${name}`)
  return found
}
