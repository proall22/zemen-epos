import JSZip from 'jszip';

import { buildRequestFormDocx, type RequestFormInput } from './docx-generator';

/** Inflate the DOCX zip and return `word/document.xml` as text — the part
 *  that carries the actual paragraph runs the test inspects. */
async function extractDocumentXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('word/document.xml missing from docx');
  return file.async('string');
}

const BASE: RequestFormInput = {
  organization: {
    organizationName: 'Test Company',
    commercialRegistrationNumber: 'CR-42',
    tin: '1234567890',
    subTin: '9999',
    vatNumber: 'VAT-1',
    registeredAddress: '123 Bole Rd',
    city: 'Addis Ababa',
    country: 'ET',
  },
  contact: {
    fullName: 'Abebe Kebede',
    jobTitle: 'CFO',
    email: 'abebe@example.com',
    phone: '+251911111111',
  },
  reason: 'Integration with EIRMS for e-invoicing.',
};

describe('buildRequestFormDocx', () => {
  it('emits a non-empty DOCX buffer', async () => {
    const buf = await buildRequestFormDocx(BASE);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.byteLength).toBeGreaterThan(0);
    // Every DOCX starts with the ZIP local-file-header magic PK\x03\x04.
    expect(buf.slice(0, 4).toString('latin1')).toBe('PK\x03\x04');
  });

  it('renders the three top-level sections in order', async () => {
    const buf = await buildRequestFormDocx(BASE);
    const xml = await extractDocumentXml(buf);
    const orgIdx = xml.indexOf('1. Organization Details');
    const contactIdx = xml.indexOf('2. Contact Person Details');
    const reasonIdx = xml.indexOf('3. Reason for Certificate Request');
    expect(orgIdx).toBeGreaterThan(0);
    expect(contactIdx).toBeGreaterThan(orgIdx);
    expect(reasonIdx).toBeGreaterThan(contactIdx);
  });

  it('renders all merchant + branch + contact + reason values', async () => {
    const buf = await buildRequestFormDocx(BASE);
    const xml = await extractDocumentXml(buf);
    for (const literal of [
      'Test Company',
      'CR-42',
      '1234567890',
      '9999',
      'VAT-1',
      '123 Bole Rd',
      'Addis Ababa',
      'ET',
      'Abebe Kebede',
      'CFO',
      'abebe@example.com',
      '+251911111111',
      'Integration with EIRMS for e-invoicing.',
    ]) {
      expect(xml).toContain(literal);
    }
  });

  it('falls back to a placeholder for blank values', async () => {
    const buf = await buildRequestFormDocx({
      ...BASE,
      contact: {
        fullName: null,
        jobTitle: null,
        email: null,
        phone: null,
      },
      reason: '   ',
    });
    const xml = await extractDocumentXml(buf);
    expect(xml).toContain('__________________');
  });
});
