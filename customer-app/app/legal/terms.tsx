import { TERMS_OF_SERVICE } from '../../lib/legalContent';
import { LegalDocumentScreen } from '../../ui/components/LegalDocumentScreen';

export default function TermsScreen() {
  return <LegalDocumentScreen title="Terms & Conditions" sections={TERMS_OF_SERVICE} />;
}
