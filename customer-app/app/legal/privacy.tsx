import { PRIVACY_POLICY } from '../../lib/legalContent';
import { LegalDocumentScreen } from '../../ui/components/LegalDocumentScreen';

export default function PrivacyScreen() {
  return <LegalDocumentScreen title="Privacy Policy" sections={PRIVACY_POLICY} />;
}
