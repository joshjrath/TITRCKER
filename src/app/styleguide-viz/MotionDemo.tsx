'use client';

import { useState } from 'react';
import { computeTithe, formatMoney, toMinor } from '@/domain';
import { AnimatedAmount, HighlightRow, Reveal } from '@/components/motion';
import styles from './page.module.css';

interface DemoRow {
  id: string;
  label: string;
  minor: number;
}

const START: DemoRow[] = [
  { id: 'r2', label: 'Sample · Design retainer', minor: 120_000 },
  { id: 'r1', label: 'Sample · Paycheque', minor: 175_000 },
];

/** Dev-only playground for the motion primitives, driven by sample numbers. */
export function MotionDemo() {
  const [rows, setRows] = useState(START);
  const [lastId, setLastId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [revealKey, setRevealKey] = useState(0);
  const titheTotal = rows.reduce((sum, r) => sum + computeTithe(toMinor(r.minor)), 0);

  const add = () => {
    const n = rows.length + 1;
    const row = { id: `r${n}`, label: `Sample · Income #${n}`, minor: 87_550 + n * 1_250 };
    setRows([row, ...rows]);
    setLastId(row.id);
    setMessage(`Saved. ${formatMoney(toMinor(row.minor), 'CAD')} added.`);
  };

  return (
    <div className={styles.motionGrid}>
      <div>
        <p className={styles.overline}>AnimatedAmount · hero</p>
        <AnimatedAmount minor={titheTotal} currency="CAD" size="hero" />
        <p className={styles.note}>Tithe on the sample rows below. Animates only after a change, never on mount.</p>
        <div className={styles.row}>
          <button type="button" className={styles.button} onClick={add}>
            Simulate a saved income
          </button>
          <button type="button" className={styles.buttonGhost} onClick={() => setRevealKey((k) => k + 1)}>
            Replay reveal
          </button>
        </div>
        <div className={styles.amountScale}>
          <AnimatedAmount minor={titheTotal} currency="CAD" size="xl" />
          <AnimatedAmount minor={titheTotal * 10} currency="CAD" size="lg" />
          <AnimatedAmount minor={-2_500} currency="USD" size="md" />
        </div>
      </div>
      <div>
        <p className={styles.overline}>HighlightRow + Reveal</p>
        <Reveal key={revealKey} className={styles.revealCard}>
          <table className={styles.demoTable}>
            <caption className={styles.srOnlyLive}>Sample income rows</caption>
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col" className={styles.num}>
                  Amount (CAD)
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <HighlightRow key={r.id} highlighted={r.id === lastId}>
                  <td>{r.label}</td>
                  <td className={styles.num}>{formatMoney(toMinor(r.minor), 'CAD')}</td>
                </HighlightRow>
              ))}
            </tbody>
          </table>
        </Reveal>
        <p className={styles.note} role="status">
          {message}
        </p>
      </div>
    </div>
  );
}
