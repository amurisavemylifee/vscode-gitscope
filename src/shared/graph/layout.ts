import type { GraphCommit, GraphLaneEdge, GraphNode } from './model';

/**
 * Раскладывает коммиты по дорожкам (swimlanes) — тот же приём, что `git log --graph`
 * и большинство визуальных клиентов: одна дорожка — одна линия истории, слияния и
 * форки рисуются диагональными переходами между дорожками.
 *
 * Инвариант, на котором держится алгоритм: в любой момент каждый SHA зарезервирован
 * не больше чем в одной дорожке — если несколько детей ссылаются на один и тот же
 * родитель (точка ветвления), второй и последующие переиспользуют уже занятую
 * дорожку вместо того, чтобы заводить новую. Поэтому у коммита никогда не может
 * быть больше одной «ожидающей» его дорожки.
 *
 * Ожидает `commits` в порядке `git log --date-order` (см. `GitRepository.listGraphCommits`):
 * ни один родитель не встречается раньше всех своих детей.
 */
export function layoutCommits(commits: readonly GraphCommit[]): GraphNode[] {
  // lanes[i] — SHA, которого дорожка i «ждёт»; null — дорожка свободна и может быть
  // переиспользована для несвязанной линии истории.
  const lanes: (string | null)[] = [];

  const allocateLane = (): number => {
    const free = lanes.indexOf(null);
    if (free !== -1) {
      return free;
    }
    lanes.push(null);
    return lanes.length - 1;
  };

  return commits.map((commit) => {
    let lane = lanes.indexOf(commit.sha);
    if (lane === -1) {
      lane = allocateLane();
    }
    // Занимаем дорожку на время резервирования под родителей этой же строки —
    // иначе резервирование под merge-родителя могло бы случайно переиспользовать
    // её же как «свободную».
    lanes[lane] = commit.sha;

    const parentEdges: GraphLaneEdge[] = commit.parents.map((parentSha, parentIndex) => {
      const existingLane = lanes.indexOf(parentSha);
      if (existingLane !== -1) {
        if (parentIndex === 0) {
          // Первый родитель уже зарезервирован другим ребёнком — эта дорожка
          // дальше не идёт, она сливается диагональю в чужую.
          lanes[lane] = null;
        }
        return { parentSha, lane: existingLane };
      }
      if (parentIndex === 0) {
        // Первый родитель продолжает ту же дорожку — прямая линия.
        lanes[lane] = parentSha;
        return { parentSha, lane };
      }
      // Остальные родители (merge) получают отдельную дорожку.
      const mergeLane = allocateLane();
      lanes[mergeLane] = parentSha;
      return { parentSha, lane: mergeLane };
    });

    if (commit.parents.length === 0) {
      lanes[lane] = null;
    }

    return { commit, lane, parentEdges, branches: [], tags: [], stashes: [] };
  });
}
