import { healthservice } from "../services/health.service.js"

export const getHealth = (req, res) => {
    const data = healthservice()

    return res.status(200).json(data)
}