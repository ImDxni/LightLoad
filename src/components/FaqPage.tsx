import { useTranslation } from 'react-i18next'

interface FaqDef { term: string; desc: string }
interface FaqItem { q: string; a: string[]; list?: FaqDef[] }

export function FaqPage() {
  const { t } = useTranslation()
  const items = t('faq.items', { returnObjects: true }) as FaqItem[]

  // FAQPage structured data → eligible for Google rich results
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(it => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: [...it.a, ...(it.list?.map(l => `${l.term}: ${l.desc}`) ?? [])].join(' '),
      },
    })),
  }

  return (
    <section className="ll-section ll-section--faq">
      <div className="ll-faq">
        <h1 className="ll-faq-title">{t('faq.title')}</h1>

        <div className="ll-faq-list">
          {items.map((it, i) => (
            <article key={i} className="ll-faq-item">
              <h2 className="ll-faq-q">{it.q}</h2>
              {it.a.map((p, j) => <p key={j} className="ll-faq-a">{p}</p>)}
              {it.list && (
                <ul className="ll-faq-defs">
                  {it.list.map((l, k) => (
                    <li key={k} className="ll-faq-def">
                      <span className="ll-faq-def-term">{l.term}</span>
                      <span className="ll-faq-def-desc">{l.desc}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>

        <a className="ll-faq-back" href="#home">← {t('faq.back')}</a>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    </section>
  )
}
