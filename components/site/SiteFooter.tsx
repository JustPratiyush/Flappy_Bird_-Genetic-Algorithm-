import { REPO_URL } from "./SiteHeader";
import styles from "./Site.module.css";

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <p>
        Made by{" "}
        <a href="https://abhinavkuchhal.com" target="_blank" rel="noopener noreferrer">
          Abhinav Kuchhal
        </a>
      </p>
      <p>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          Get the code on GitHub
        </a>
      </p>
    </footer>
  );
}
