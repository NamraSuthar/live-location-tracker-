import express, { Router } from "express"
import { getHealth } from "../controller/health.controller.js"



const router = express.Router()

router.get("/", getHealth);

export default router 