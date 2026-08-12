import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';

export interface Brand {
  sellerName: string;
  logoUrl: string;
  sellerEmail: string;
  sellerPhone: string;
}

export interface InfoRowData {
  label: string;
  value: string;
}

export interface FeatureItem {
  title: string;
  description: string;
}

export interface LayoutProps {
  brand: Brand;
  preview: string;
  heading: string;
  intro: string;
  rows: InfoRowData[];
  cta?: { label: string; url: string };
  /** Absolute URL of the QR PNG. When set, it's shown in the hero (and linked
   *  as a text fallback for clients that block remote images). */
  qrUrl?: string;
  /** Optional feature highlights rendered below the info rows — used by the
   *  merchant welcome email so the new owner sees what they're getting. */
  features?: FeatureItem[];
  /** Optional accent line rendered above the heading (e.g. status pill text). */
  tagline?: string;
  /** Sets the hero background. Defaults to the neutral muted slate. */
  tone?: 'neutral' | 'success' | 'warning';
}

const tailwindConfig = {
  theme: {
    extend: {
      colors: {
        brand: '#5700FF',
        ink: '#0f172a',
        muted: '#475569',
        faint: '#94a3b8',
        bg: '#ffffff',
        bg2: '#f1f5f9',
        line: '#e2e8f0',
      },
    },
  },
};

/** Email-safe (inline-style) background tints for the hero panel. We avoid
 *  Tailwind here because Tailwind colors aren't always inlined by the email
 *  renderer when they're conditional. */
const HERO_BG: Record<NonNullable<LayoutProps['tone']>, string> = {
  neutral: '#f1f5f9',
  success: '#ecfdf5',
  warning: '#fef3c7',
};
const HERO_ACCENT: Record<NonNullable<LayoutProps['tone']>, string> = {
  neutral: '#5700FF',
  success: '#047857',
  warning: '#92400e',
};

export function Layout({
  brand,
  preview,
  heading,
  intro,
  rows,
  cta,
  qrUrl,
  features,
  tagline,
  tone = 'neutral',
}: LayoutProps) {
  const heroBg = HERO_BG[tone];
  const accent = HERO_ACCENT[tone];
  return (
    <Tailwind config={tailwindConfig}>
      <Html>
        <Head />
        <Preview>{preview}</Preview>
        <Body className="m-0 bg-bg2 text-center font-sans">
          <Container className="mx-auto my-8 w-full max-w-[600px]">
            {/* White content card wrapping the whole message */}
            <Section className="rounded-[12px] border border-solid border-line bg-bg px-6 py-5">
              {/* Header bar — single logo */}
              <Row className="mb-2">
                <Column className="w-1/2 align-middle">
                  {brand.logoUrl ? (
                    <Img
                      src={brand.logoUrl}
                      alt={brand.sellerName}
                      height={26}
                      className="block"
                    />
                  ) : (
                    <Text className="m-0 text-left text-[15px] font-semibold text-ink">
                      {brand.sellerName}
                    </Text>
                  )}
                </Column>
                <Column className="w-1/2 text-right align-middle">
                  <Text className="m-0 text-[12px] text-faint">
                    e-Invoice
                  </Text>
                </Column>
              </Row>

              {/* Hero */}
              <Section
                className="rounded-[10px] px-8 py-10 text-center"
                style={{ backgroundColor: heroBg }}
              >
                {tagline ? (
                  <Text
                    className="m-0 mb-3 text-[11px] font-semibold uppercase tracking-[0.16em]"
                    style={{ color: accent }}
                  >
                    {tagline}
                  </Text>
                ) : null}
                <Heading
                  as="h1"
                  className="m-0 mb-3 text-[24px] font-bold text-ink"
                >
                  {heading}
                </Heading>
                <Text className="mx-auto mt-0 mb-6 max-w-[420px] text-[15px] leading-6 text-muted">
                  {intro}
                </Text>

                {qrUrl ? (
                  <Section className="mb-6 text-center">
                    <Link href={qrUrl}>
                      <Img
                        src={qrUrl}
                        alt="Invoice verification QR"
                        width={150}
                        height={150}
                        className="mx-auto block rounded-[8px] border border-solid border-line bg-white p-2"
                      />
                    </Link>
                    <Text className="m-0 mt-2 text-[12px] text-muted">
                      Scan to verify ·{' '}
                      <Link href={qrUrl} className="font-medium text-brand underline">
                        open QR
                      </Link>
                    </Text>
                  </Section>
                ) : null}

                {rows.length > 0 ? (
                  <Section className="rounded-[8px] border border-solid border-line bg-bg px-5 py-2 text-left">
                    {rows.map((r) => (
                      <Row key={r.label} className="py-[6px]">
                        <Column className="align-top text-[13px] text-muted">
                          {r.label}
                        </Column>
                        <Column className="text-right align-top text-[13px] font-medium text-ink">
                          {r.value}
                        </Column>
                      </Row>
                    ))}
                  </Section>
                ) : null}

                {features && features.length > 0 ? (
                  <Section className="mt-5 rounded-[8px] border border-solid border-line bg-bg px-5 py-2 text-left">
                    {features.map((f, i) => (
                      <Section
                        key={f.title}
                        className={
                          i < features.length - 1
                            ? 'border-0 border-b border-solid border-line py-3'
                            : 'py-3'
                        }
                      >
                        <Text className="m-0 text-[14px] font-semibold text-ink">
                          {f.title}
                        </Text>
                        <Text className="m-0 mt-1 text-[13px] leading-5 text-muted">
                          {f.description}
                        </Text>
                      </Section>
                    ))}
                  </Section>
                ) : null}

                {cta ? (
                  <>
                    <Section className="mt-7 text-center">
                      <Button
                        href={cta.url}
                        className="inline-block rounded-[8px] bg-brand px-7 py-4 text-[14px] font-semibold leading-4 text-white"
                      >
                        {cta.label}
                      </Button>
                    </Section>
                    <Text className="m-0 mt-3 text-center text-[12px] text-muted">
                      Or open this link:{' '}
                      <Link href={cta.url} className="text-brand underline">
                        {cta.url}
                      </Link>
                    </Text>
                  </>
                ) : null}
              </Section>

              {/* Footer */}
              <Section className="px-2 pt-6 text-center">
                <Text className="m-0 text-[12px] font-medium text-ink">
                  {brand.sellerName}
                </Text>
                <Text className="m-0 text-[12px] text-muted">
                  {brand.sellerEmail}
                  {brand.sellerPhone ? ` · ${brand.sellerPhone}` : ''}
                </Text>
                <Hr className="my-4 border-line" />
                <Text className="m-0 text-[11px] text-faint">
                  This is an automated message from the e-invoicing system.
                  Please do not reply.
                </Text>
              </Section>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
