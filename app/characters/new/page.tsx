import { TopNav } from "@/components/top-nav";
import { NewCharacterFlowV2 } from "@/components/character/NewCharacterFlowV2";

export default async function NewCharacterPage() {
  return (
    <>
      <TopNav active="characters" />
      <NewCharacterFlowV2 />
    </>
  );
}
