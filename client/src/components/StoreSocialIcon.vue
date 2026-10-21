<script setup>
import { computed } from 'vue';
const props=defineProps({network:{type:String,default:'website'},size:{type:[Number,String],default:24}});
const paths={
 instagram:['M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z','M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0','M17.5 6.5h.01'],
 facebook:['M14.5 21v-8H18l.6-4h-4.1V6.8c0-1.2.5-1.8 1.8-1.8H19V1.7A29 29 0 0 0 15.5 1C12 1 10 3.1 10 6.5V9H6v4h4v8'],
 tiktok:['M14 3v12.5a4.5 4.5 0 1 1-4.5-4.5','M14 3c.5 4.1 2.5 6 6 6V5.5A6 6 0 0 1 17 3Z'],
 youtube:['M3 7c.2-2 1.5-3 3-3h12c1.5 0 2.8 1 3 3 .5 3 .5 7 0 10-.2 2-1.5 3-3 3H6c-1.5 0-2.8-1-3-3-.5-3-.5-7 0-10Z','m10 8 6 4-6 4V8Z'],
 x:['M4 3h4l12 18h-4L4 3ZM20 3 4 21'],
 linkedin:['M4 9v12M4 4v.01M9 21V9h4v2a4 4 0 0 1 7 3v7M13 11v10'],
 pinterest:['M9 21 12 9M10 15c1.3 2.7 5.5 2.6 7.4-.1 2.3-3.4 1.8-10-3.2-11.4C8.3 1.8 3 5.7 4.1 11a5.3 5.3 0 0 0 2.5 3.5'],
 threads:['M19 7C17 1 7 1 4 7c-2 4-1 12 6 14 8 2 12-6 7-10-2-2-7-2-9 1-2 4 5 6 7 1 2-5-1-9-5-6'],
 twitch:['M4 3h18v12l-5 5h-4l-3 3v-3H4V3ZM10 7v6M16 7v6'],
 whatsapp:['M21 11.5a9 9 0 0 1-13 8L3 21l1.5-5A9 9 0 1 1 21 11.5Z','M8 7.5c-.5 1-.5 2 .2 3.5 1 2 2.3 3.3 4.3 4.3 1.5.7 2.5.7 3.5.2l.5-2-2.5-1-1 1-2.5-2.5 1-1-1-2.5H8Z'],
 website:['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z','M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18']
};
const icon=computed(()=>paths[props.network]||paths.website);
</script>
<template><svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path v-for="(path,index) in icon" :key="index" :d="path"/></svg></template>
