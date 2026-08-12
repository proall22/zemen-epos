import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';

/**
 * Build the "CERTIFICATE REQUEST FORM" DOCX INSA expects to receive by email
 * alongside the CSR. Structure and field labels match the template the ops
 * team locked in — do not reorder or rename without ops approval, since
 * INSA processes these forms manually.
 *
 * Fields marked `contact*` and `reason` are user-authored (edited in the
 * onboarding wizard); everything else is pulled straight from the Merchant
 * + Branch records so the form always reflects current DB state.
 */

export interface DocxOrganization {
  organizationName: string;
  commercialRegistrationNumber: string | null;
  tin: string;
  subTin: string | null;
  vatNumber: string | null;
  registeredAddress: string | null;
  city: string | null;
  country: string | null;
}

export interface DocxContact {
  fullName: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
}

export interface RequestFormInput {
  organization: DocxOrganization;
  contact: DocxContact;
  reason: string | null;
}

const PLACEHOLDER = '__________________';

export async function buildRequestFormDocx(
  input: RequestFormInput,
): Promise<Buffer> {
  const doc = new Document({
    creator: 'EIRMS',
    title: 'CERTIFICATE REQUEST FORM',
    sections: [
      {
        children: [
          heading('CERTIFICATE REQUEST FORM'),
          section('1. Organization Details'),
          bullet('Organization Name', input.organization.organizationName),
          bullet(
            'Commercial Registration (CR) Number',
            input.organization.commercialRegistrationNumber,
          ),
          bullet('Tin Number', input.organization.tin),
          bullet('Sub-Tin Number', input.organization.subTin),
          bullet(
            'VAT Registration Number',
            input.organization.vatNumber,
          ),
          bullet(
            'Registered Address',
            input.organization.registeredAddress,
          ),
          bullet('City', input.organization.city),
          bullet('Country', input.organization.country ?? 'ET'),
          spacer(),
          section('2. Contact Person Details'),
          bullet('Full Name', input.contact.fullName),
          bullet('Job Title', input.contact.jobTitle),
          bullet('Email Address', input.contact.email),
          bullet('Phone Number', input.contact.phone),
          spacer(),
          section('3. Reason for Certificate Request'),
          new Paragraph({
            children: [new TextRun(input.reason?.trim() || PLACEHOLDER)],
          }),
        ],
      },
    ],
  });
  return await Packer.toBuffer(doc);
}

function heading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold: true })],
  });
}

function section(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, bold: true })],
  });
}

/** Rendered as "● <label>: <value>" — bullet + bold label. Blank values fall
 *  back to a placeholder so INSA can pen the missing bit if needed. */
function bullet(label: string, value: string | null | undefined): Paragraph {
  const shownValue = value && value.trim().length > 0 ? value : PLACEHOLDER;
  return new Paragraph({
    bullet: { level: 0 },
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun(shownValue),
    ],
  });
}

function spacer(): Paragraph {
  return new Paragraph({ children: [] });
}
