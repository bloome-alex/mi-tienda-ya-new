import { User, Plan } from '../models/index.js';

const roundMoney = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

/**
 * Métricas administrativas derivadas de usuarios y planes.
 * El ingreso mensual es una proyección bruta: supone que cada vendedor activo
 * con un plan asignado renueva ese mismo plan y normaliza duraciones distintas
 * de 30 días a un equivalente mensual. No descuenta comisiones del proveedor.
 */
export class AdminDashboardService {
  async subscriptionSummary() {
    const [assigned, planRows] = await Promise.all([
      User.aggregate([
        { $match: { role: 'vendedor', active: true } },
        { $group: { _id: { $ifNull: ['$planId', null] }, users: { $sum: 1 } } },
      ]),
      Plan.find({}).sort({ sortOrder: 1, price: 1, createdAt: 1 }).select('name price durationDays visible active sortOrder').lean(),
    ]);

    const counts = new Map(assigned.filter(row => row._id).map(row => [String(row._id), Number(row.users || 0)]));
    const knownPlanIds = new Set(planRows.map(plan => String(plan._id)));
    let withoutPlan = assigned.filter(row => !row._id).reduce((sum, row) => sum + Number(row.users || 0), 0);
    for (const row of assigned) if (row._id && !knownPlanIds.has(String(row._id))) withoutPlan += Number(row.users || 0);

    const plans = planRows.map(plan => {
      const durationDays = Math.max(1, Number(plan.durationDays || 30));
      const price = roundMoney(plan.price);
      const monthlyUnit = roundMoney(price * 30 / durationDays);
      const users = counts.get(String(plan._id)) || 0;
      return {
        planId: plan._id,
        name: plan.name || 'Plan sin nombre',
        users,
        price,
        durationDays,
        monthlyUnit,
        estimatedMonthly: roundMoney(monthlyUnit * users),
        visible: plan.visible !== false,
        active: plan.active !== false,
      };
    });

    return {
      plans,
      withoutPlan,
      usersWithPlan: plans.reduce((sum, plan) => sum + plan.users, 0),
      estimatedMonthlyRevenue: roundMoney(plans.reduce((sum, plan) => sum + plan.estimatedMonthly, 0)),
      currency: 'ARS',
      basis: 'assigned_plans',
    };
  }
}

export const adminDashboardService = new AdminDashboardService();
