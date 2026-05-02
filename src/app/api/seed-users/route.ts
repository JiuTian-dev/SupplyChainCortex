import { withErrorHandler, apiSuccess } from '@/lib/api-utils';
import { seedDefaultAdmin } from '@/lib/services/user.service';

export const POST = withErrorHandler(async () => {
  await seedDefaultAdmin();
  return apiSuccess({ message: 'Default users seeded successfully' });
});
