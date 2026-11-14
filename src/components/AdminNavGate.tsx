import { getViewer } from '@/lib/roles';
import { Nav } from './Nav';

/** Async server child: looks up the viewer's role, then renders the nav. */
export async function AdminNavGate() {
  const viewer = await getViewer();
  return <Nav isAdmin={viewer.isAdmin} />;
}
