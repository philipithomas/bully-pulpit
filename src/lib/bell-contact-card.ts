import { siteIdentity } from '@/lib/site-identity'
import { renderVCard } from '@/lib/vcard'

export const BELL_CONTACT_PHOTO_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAMFBMVEXz8OrDwLpsaV4XFQw+SCNAjj8qKBba19CfnZaEV0T41zj1zhDftwxwWySvmDSGawh6EbnHAAABj0lEQVRYw+2W627DIAyFC3jGHRje/213CEnaaVnCRdt+rEdRhCqdr9gYx7fbSy9dyVjIzPgdNEGw9AaRnfEzF4IfsfviJ1vfI1GIg5P9jUBw8gcAnAATjsCyIzy9MRixRMQPWZGeTBp293coxE3quCMM0ZTSAqgCIOWs0h5+epjDDmkmCPzhSI0Ez3rsD1HZTAJcA8AjgwDEDMXViAzmVH6jhrMUXvxaLnJeYy9rioXQUJLiAIiEwhGxCyHXNQhtAOwgab1+xiIK+Ovl1NgMUNwh/KnBdmJgi8IWGEm7AOhmdgMIUjAI4M+A1JjEI4DvBZinHPiybgYghPjpFOoNMFZTcw5QR091kHRZa0cdwPW1EkNPJYa1Fe39pK57AMfXcRqQfgXAc4BvG+KahKu2eO6/Jlz5S1GctTXDl37s4eQT1QZwPwlA9ccrnQHQOPOl9HTeWea6c9Hpt8WbXYIJZRNmxV3Nc4Y43URDQ5axpPciJR4cVisBG6ChQbMQuPjZjvoRxTKgTY3rc+P+S/9GHzVEKklZP4g0AAAAAElFTkSuQmCC'

export function renderBellContactCard(phoneNumber: string): string {
  return renderVCard({
    name: 'Bell',
    organization: siteIdentity.name,
    phoneNumber,
    website: siteIdentity.productionUrl,
    photo: { base64: BELL_CONTACT_PHOTO_BASE64, type: 'PNG' },
  })
}
