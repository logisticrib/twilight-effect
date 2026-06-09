import { useGameStore } from '../../../store/gameStore';
import { MulliganModal }    from './MulliganModal';
import { ClassBonusModal }  from './ClassBonusModal';
import { OathswornModal }   from './OathswornModal';
import { PoisonModal }      from './PoisonModal';
import { PCPlacementModal } from './PCPlacementModal';

/** Parse "modalId:player" format → { id, player } */
function parseModalId(raw: string): { id: string; player: 'p1' | 'p2' } {
  const [id, player] = raw.split(':');
  return { id, player: (player === 'p2' ? 'p2' : 'p1') };
}

export function ModalHost() {
  const { modalQueue, advanceModal } = useGameStore();
  const raw = modalQueue[0];
  if (!raw) return null;

  const { id, player } = parseModalId(raw);
  const isSequence = modalQueue.length > 1;

  switch (id) {
    case 'mulligan':
      return <MulliganModal  key={raw} player={player} onClose={advanceModal} isSequence={isSequence} />;
    case 'classbonus':
      return <ClassBonusModal key={raw} player={player} onClose={advanceModal} isSequence={isSequence} />;
    case 'place-pc':
      return <PCPlacementModal onClose={advanceModal} />;
    case 'oathsworn':
      return <OathswornModal onClose={advanceModal} />;
    case 'poison':
      return <PoisonModal    onClose={advanceModal} />;
    default:
      return null;
  }
}
