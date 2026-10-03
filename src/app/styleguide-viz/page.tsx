import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { CumulativeChart, MonthlyBreakdown, OrbitalArc, PeriodTimeline } from '@/components/charts';
import { AnimatedAmount } from '@/components/motion';
import { MotionDemo } from './MotionDemo';
import { emptyPeriod, firstPeriod, fullYear, multiYear } from './sample-data';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Visualization styleguide (dev)',
  robots: { index: false, follow: false },
};

/**
 * DEV-ONLY visual reference for the chart and motion components. Every figure is sample data.
 * 404 in production unless TENTH_TEST_MODE=1 (used by visual tests).
 */
export default async function StyleguideVizPage() {
  await connection();
  if (process.env.NODE_ENV === 'production' && process.env.TENTH_TEST_MODE !== '1') notFound();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.h1}>Visualization styleguide</h1>
        <p className={styles.notice}>Development only. Every figure on this page is sample data, not a real record.</p>
      </header>

      <section className={styles.section} aria-labelledby="sg-composition">
        <h2 id="sg-composition" className={styles.h2}>
          Overview composition <span className={styles.sample}>sample · today = Nov 18, 2026</span>
        </h2>
        <div className={styles.composition}>
          <OrbitalArc progress={firstPeriod.progress} className={styles.compositionArc} />
          <div className={styles.hero}>
            <p className={styles.heroLabel}>
              Still to give <span className={styles.rate}>10%</span>
            </p>
            <AnimatedAmount minor={firstPeriod.stillToGiveMinor} currency="CAD" size="hero" />
            <dl className={styles.stats}>
              <div>
                <dt>Income received</dt>
                <dd>
                  <AnimatedAmount minor={522_500} currency="CAD" />
                </dd>
              </div>
              <div>
                <dt>Tithe accrued</dt>
                <dd>
                  <AnimatedAmount minor={52_250} currency="CAD" />
                </dd>
              </div>
              <div>
                <dt>Given</dt>
                <dd>
                  <AnimatedAmount minor={20_000} currency="CAD" />
                </dd>
              </div>
            </dl>
          </div>
          <div className={styles.yearEnd}>
            <p className={styles.heroLabel}>Year-end payout</p>
            <p className={styles.payoutDate}>Dec 31, 2026</p>
            <p className={styles.countdown}>43 days until payout</p>
            <PeriodTimeline
              start="2026-10-03"
              end="2026-12-31"
              today={firstPeriod.today}
              payoutDate="2026-12-31"
              todayLabel="Today"
            />
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="sg-charts">
        <h2 id="sg-charts" className={styles.h2}>
          Chart + monthly breakdown <span className={styles.sample}>sample · CAD</span>
        </h2>
        <div className={styles.split}>
          <div className={styles.panel}>
            <CumulativeChart series={firstPeriod.series} today={firstPeriod.today} payoutLabel="Payout Dec 31" />
          </div>
          <div className={styles.panel}>
            <MonthlyBreakdown rows={firstPeriod.monthly} currency="CAD" rangeLabel="Oct 3 – Dec 31, 2026" />
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="sg-year">
        <h2 id="sg-year" className={styles.h2}>
          Full calendar year <span className={styles.sample}>sample · USD · today = Aug 14, 2027</span>
        </h2>
        <div className={styles.split}>
          <div className={styles.panel}>
            <CumulativeChart series={fullYear.series} today={fullYear.today} payoutLabel="Payout Dec 31" />
          </div>
          <div className={styles.panel}>
            <MonthlyBreakdown rows={fullYear.monthly} currency="USD" rangeLabel="Jan 1 – Dec 31, 2027" />
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="sg-empty">
        <h2 id="sg-empty" className={styles.h2}>
          Empty states <span className={styles.sample}>new account · today = Oct 3, 2026</span>
        </h2>
        <div className={styles.split}>
          <div className={styles.panel}>
            <CumulativeChart
              series={emptyPeriod.series}
              today={emptyPeriod.today}
              emptyMessage="Your accrued tithe will build here as you add income."
            />
          </div>
          <div className={[styles.panel, styles.emptyHero].join(' ')}>
            <OrbitalArc progress={0} variant="empty" />
            <div className={styles.emptyHeroInner}>
              <p className={styles.heroLabel}>Still to give</p>
              <AnimatedAmount minor={0} currency="CAD" size="xl" />
              <MonthlyBreakdown rows={[]} currency="CAD" rangeLabel="Oct 3 – Dec 31, 2026" className={styles.mt} />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="sg-timeline">
        <h2 id="sg-timeline" className={styles.h2}>
          Period timeline states <span className={styles.sample}>sample dates</span>
        </h2>
        <div className={styles.timelines}>
          <figure className={styles.timelineCase}>
            <figcaption>Day one</figcaption>
            <PeriodTimeline start="2026-10-03" end="2026-12-31" today="2026-10-03" payoutDate="2026-12-31" todayLabel="Today" payoutLabel="Dec 31" />
          </figure>
          <figure className={styles.timelineCase}>
            <figcaption>Due today</figcaption>
            <PeriodTimeline start="2026-10-03" end="2026-12-31" today="2026-12-31" payoutDate="2026-12-31" todayLabel="Today" />
          </figure>
          <figure className={styles.timelineCase}>
            <figcaption>Full year, mid-August</figcaption>
            <PeriodTimeline start="2027-01-01" end="2027-12-31" today="2027-08-14" payoutDate="2027-12-31" />
          </figure>
          <figure className={styles.timelineCase}>
            <figcaption>Custom payout in late November</figcaption>
            <PeriodTimeline start="2026-10-03" end="2026-12-31" today="2026-11-02" payoutDate="2026-11-28" todayLabel="Today" />
          </figure>
        </div>
        <div className={[styles.panel, styles.mt].join(' ')}>
          <MonthlyBreakdown rows={multiYear} currency="CAD" rangeLabel="All time" title="Monthly breakdown (spans years, refund month)" />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="sg-motion">
        <h2 id="sg-motion" className={styles.h2}>
          Motion <span className={styles.sample}>sample rows</span>
        </h2>
        <div className={styles.panel}>
          <MotionDemo />
        </div>
      </section>
    </main>
  );
}
