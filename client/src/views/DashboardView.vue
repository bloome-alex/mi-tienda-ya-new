<script setup>
import { auth } from '../services/auth.js';
import AdminDashboard from './admin/DashboardView.vue';
import SellerDashboard from './seller/DashboardView.vue';
</script>
<template><AdminDashboard v-if="auth.user?.role==='admin'" /><SellerDashboard v-else /></template>
