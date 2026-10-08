import Image from "next/image";
import { GitHubIcon } from "@/components/game/icons";
import styles from "./Site.module.css";

export const REPO_URL = "https://github.com/JustPratiyush/Flappy_Bird_-Genetic-Algorithm-";

export default function SiteHeader() {
  return (
    <header className={styles.topbar}>
      <a href="#play" className={styles.brand}>
        <Image src="/assets/images/flappybird.gif" alt="" width={34} height={24} unoptimized priority />
        <span>
          Flappy Bird <span className={styles.brandAccent}>AI</span>
        </span>
      </a>
      <nav className={styles.nav} aria-label="Sections">
        <a href="#play" className={`${styles.navLink} ${styles.navOptional}`}>
          Play
        </a>
        <a href="#how" className={styles.navLink}>
          How it learns
        </a>
        <a href="#lab" className={`${styles.navLink} ${styles.navOptional}`}>
          Experiments
        </a>
        <a href={REPO_URL} className={styles.navIcon} target="_blank" rel="noopener noreferrer" aria-label="Source code on GitHub">
          <GitHubIcon />
        </a>
      </nav>
    </header>
  );
}
