import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const optionsRouter = Router();

// GET /api/organizers/:id/options — list all option groups with choices
optionsRouter.get('/:id/options', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const groups = await prisma.bookingOptionGroup.findMany({
      where: { organizerId: id },
      include: { choices: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(groups);
  } catch (err) {
    console.error('GET /organizers/:id/options error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/organizers/:id/options — create or update an option group
optionsRouter.post('/:id/options', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { groupId, title, choices } = req.body as {
      groupId?: string;
      title: string;
      choices: { label: string; sortOrder?: number }[];
    };

    if (!title || !Array.isArray(choices) || choices.length === 0) {
      res.status(400).json({ error: 'title and non-empty choices array required' });
      return;
    }

    let group;
    if (groupId) {
      // Update existing group
      group = await prisma.bookingOptionGroup.update({
        where: { id: groupId, organizerId: id },
        data: { title },
      });

      // Delete old choices and recreate
      await prisma.bookingOptionChoice.deleteMany({ where: { groupId } });
    } else {
      // Create new group
      group = await prisma.bookingOptionGroup.create({
        data: { organizerId: id, title },
      });
    }

    // Create choices
    await prisma.bookingOptionChoice.createMany({
      data: choices.map((c, i) => ({
        groupId: group.id,
        label: c.label,
        sortOrder: c.sortOrder ?? i,
      })),
    });

    const result = await prisma.bookingOptionGroup.findUnique({
      where: { id: group.id },
      include: { choices: { orderBy: { sortOrder: 'asc' } } },
    });

    res.status(groupId ? 200 : 201).json(result);
  } catch (err) {
    console.error('POST /organizers/:id/options error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/organizers/:id/options/:groupId
optionsRouter.delete('/:id/options/:groupId', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const groupId = req.params.groupId as string;

    const group = await prisma.bookingOptionGroup.findFirst({
      where: { id: groupId, organizerId: id },
    });

    if (!group) {
      res.status(404).json({ error: 'Option group not found' });
      return;
    }

    // Clear references in appointments first
    await prisma.appointment.updateMany({
      where: { selectedChoiceId: { in: (await prisma.bookingOptionChoice.findMany({ where: { groupId }, select: { id: true } })).map(c => c.id) } },
      data: { selectedChoiceId: null },
    });

    await prisma.bookingOptionGroup.delete({ where: { id: groupId } });

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /organizers/:id/options/:groupId error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
