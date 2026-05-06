import { Resend } from 'resend'
import type { BugRequest, Profile } from '@/types'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL || 'noreply@glintcompany.com'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL

function requestUrl(id: string, isAdmin = false) {
  return isAdmin
    ? `${APP_URL}/admin/requests/${id}`
    : `${APP_URL}/dashboard/request/${id}`
}

export async function notifyDevAssigned(
  dev: Profile,
  request: BugRequest
): Promise<void> {
  await resend.emails.send({
    from: `glint. <${FROM}>`,
    to: dev.email,
    subject: `[glint.] Nuova richiesta da revisionare — ${request.title}`,
    html: `
      <div style="font-family: 'DM Sans', sans-serif; background: #0C1E1A; color: #fff; padding: 40px; border-radius: 8px; max-width: 600px;">
        <div style="margin-bottom: 24px;">
          <span style="color: #DCFF33; font-size: 24px; font-weight: 700;">glint.</span>
        </div>
        <h1 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">Nuova richiesta assegnata</h1>
        <p style="color: #D6D3C9; margin-bottom: 24px;">
          L'AI ha generato un fix per la seguente richiesta. Revisiona e approva o modifica.
        </p>
        <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <p style="font-weight: 700; margin: 0 0 8px;">${request.title}</p>
          <p style="color: #D6D3C9; margin: 0; font-size: 14px;">${request.description.slice(0, 200)}${request.description.length > 200 ? '…' : ''}</p>
          <p style="color: #DCFF33; font-size: 12px; margin: 12px 0 0; text-transform: uppercase; letter-spacing: 0.5px;">
            Tipo: ${request.fix_type === 'frontend' ? 'Frontend' : request.fix_type === 'backend' ? 'Backend' : 'Da classificare'}
          </p>
        </div>
        <a href="${requestUrl(request.id, true)}"
           style="display: inline-block; background: #FD3B01; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 700;">
          Vai alla revisione →
        </a>
      </div>
    `,
  })
}

export async function notifyStoreManager(
  manager: Profile,
  request: BugRequest
): Promise<void> {
  await resend.emails.send({
    from: `glint. <${FROM}>`,
    to: manager.email,
    subject: `[glint.] Nuova richiesta per il tuo store — ${request.title}`,
    html: `
      <div style="font-family: 'DM Sans', sans-serif; background: #0C1E1A; color: #fff; padding: 40px; border-radius: 8px; max-width: 600px;">
        <div style="margin-bottom: 24px;">
          <span style="color: #DCFF33; font-size: 24px; font-weight: 700;">glint.</span>
        </div>
        <h1 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">Nuova richiesta di fix</h1>
        <p style="color: #D6D3C9; margin-bottom: 24px;">
          Un cliente ha aperto una nuova richiesta per uno store che gestisci.
        </p>
        <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <p style="font-weight: 700; margin: 0 0 8px;">${request.title}</p>
          <p style="color: #D6D3C9; margin: 0; font-size: 14px;">${request.description.slice(0, 200)}${request.description.length > 200 ? '…' : ''}</p>
        </div>
        <a href="${requestUrl(request.id, true)}"
           style="display: inline-block; background: #FD3B01; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 700;">
          Visualizza richiesta →
        </a>
      </div>
    `,
  })
}

export async function notifyClientDeployed(
  clientEmail: string,
  request: BugRequest,
  stagingThemeName: string
): Promise<void> {
  await resend.emails.send({
    from: `glint. <${FROM}>`,
    to: clientEmail,
    subject: `[glint.] Il tuo fix è pronto — ${request.title}`,
    html: `
      <div style="font-family: 'DM Sans', sans-serif; background: #0C1E1A; color: #fff; padding: 40px; border-radius: 8px; max-width: 600px;">
        <div style="margin-bottom: 24px;">
          <span style="color: #DCFF33; font-size: 24px; font-weight: 700;">glint.</span>
        </div>
        <h1 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">Fix pronto per il test</h1>
        <p style="color: #D6D3C9; margin-bottom: 24px;">
          Il fix per "<strong>${request.title}</strong>" è stato approvato e caricato su un tema di staging nel tuo store.
        </p>
        <div style="background: rgba(220,255,51,0.1); border: 1px solid #DCFF33; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <p style="color: #DCFF33; font-weight: 700; margin: 0 0 4px; font-size: 14px;">TEMA DI STAGING</p>
          <p style="margin: 0; font-weight: 700;">${stagingThemeName}</p>
          <p style="color: #D6D3C9; font-size: 13px; margin: 8px 0 0;">
            Testa il tema nel tuo Shopify Admin → Online Store → Themes.<br>
            Quando sei soddisfatto, pubblica il tema.
          </p>
        </div>
        <a href="${requestUrl(request.id, false)}"
           style="display: inline-block; background: #FD3B01; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 700;">
          Visualizza richiesta →
        </a>
      </div>
    `,
  })
}

export async function notifyClientChangesRequested(
  clientEmail: string,
  request: BugRequest,
  notes: string
): Promise<void> {
  await resend.emails.send({
    from: `glint. <${FROM}>`,
    to: clientEmail,
    subject: `[glint.] Chiarimento richiesto — ${request.title}`,
    html: `
      <div style="font-family: 'DM Sans', sans-serif; background: #0C1E1A; color: #fff; padding: 40px; border-radius: 8px; max-width: 600px;">
        <div style="margin-bottom: 24px;">
          <span style="color: #DCFF33; font-size: 24px; font-weight: 700;">glint.</span>
        </div>
        <h1 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">Chiarimento richiesto</h1>
        <p style="color: #D6D3C9; margin-bottom: 24px;">
          Il nostro team ha bisogno di ulteriori informazioni per completare la tua richiesta.
        </p>
        <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <p style="color: #D6D3C9; font-size: 14px; margin: 0;">${notes}</p>
        </div>
        <a href="${requestUrl(request.id, false)}"
           style="display: inline-block; background: #FD3B01; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 700;">
          Visualizza richiesta →
        </a>
      </div>
    `,
  })
}
