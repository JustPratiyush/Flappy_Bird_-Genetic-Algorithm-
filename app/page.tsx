import Explainer from "@/components/explainer/Explainer";
import Playground from "@/components/game/Playground";
import Lab from "@/components/lab/Lab";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Playground />
        <Explainer />
        <Lab />
      </main>
      <SiteFooter />
    </>
  );
}
