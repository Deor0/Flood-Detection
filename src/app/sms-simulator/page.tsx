import styles from '@/components/page-ui.module.css';
import { Simulator } from './Simulator';

export const dynamic = 'force-dynamic';

export default function SmsSimulatorPage() {
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>SMS Simulator</h1>
          <p className={styles.lede}>
            Try the text-message commands without a phone. This runs the real command logic against
            the registry, but nothing is sent to any phone or provider.
          </p>
        </div>
      </div>
      <Simulator />
    </main>
  );
}
